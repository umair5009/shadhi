const { Booking, Customer, Hall } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, escapeRegex } = require('../../utils/listQuery');
const { eventWindow, todayInTimeZone, formatDateOnly } = require('../../utils/dates');
const { nextDocumentNumber } = require('../../services/numbering');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings, getBusinessSettings } = require('../../services/settings');
const { checkAvailability, conflictError, describeConflict } = require('./bookingConflicts');
const { buildBookingMenu } = require('./bookingMenu.builder');
const { collectedFor, computeFinancials } = require('./bookingFinance.service');
const { withBookingLock } = require('./bookingLock');
const { customerSearch } = require('../customers/customers.service');
const paymentsService = require('../payments/payments.service');
const {
  BLOCKING_BOOKING_STATUSES,
  OPEN_BOOKING_STATUSES,
  BOOKING_STATUS_TRANSITIONS,
  BOOKING_STATUSES,
  EVENT_TYPES,
  MONEY_EPSILON,
  getFinanceIssues,
  lineTotal,
  labelOf,
  formatMoney,
} = require('../../config/shared');

const SORTABLE = {
  eventDate: 'startAt',
  createdAt: 'createdAt',
  bookingNumber: 'bookingNumber',
  guestCount: 'guestCount',
  grandTotal: 'totals.grandTotal',
  balance: 'totals.balance',
};

const LIST_POPULATE = [
  { path: 'customer', select: 'fullName phone' },
  { path: 'hall', select: 'name color' },
];

const DETAIL_POPULATE = [
  { path: 'customer', select: 'fullName phone alternatePhone email address city cnic' },
  { path: 'hall', select: 'name capacity color basePrice status' },
  { path: 'createdBy', select: 'name' },
  { path: 'updatedBy', select: 'name' },
  { path: 'statusHistory.by', select: 'name' },
  { path: 'cancellation.by', select: 'name' },
];

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);
const isBlocking = (status) => BLOCKING_BOOKING_STATUSES.includes(status);

function assertFinanceValid(draft, totals) {
  const issues = getFinanceIssues(draft, totals);
  if (issues.length) throw ApiError.unprocessable(issues[0].message, issues);
}

function priceServices(services) {
  return (services ?? []).map((service) => ({ ...service, total: lineTotal(service.quantity, service.unitPrice) }));
}

async function loadCustomer(ctx, id) {
  const customer = await Customer.findOne({ _id: id, organizationId: ctx.organizationId }).select('fullName phone').lean();
  if (!customer) throw invalid('customer', 'Choose a valid customer');
  return customer;
}

async function loadHall(ctx, id) {
  const hall = await Hall.findOne({ _id: id, organizationId: ctx.organizationId }).lean();
  if (!hall) throw invalid('hall', 'Choose a valid hall');
  if (hall.status === 'inactive') throw invalid('hall', `${hall.name} is inactive and cannot be booked`);
  return hall;
}

function hallWarnings(hall, guestCount) {
  const warnings = [];
  if (hall.status === 'maintenance') warnings.push(`${hall.name} is marked as under maintenance`);
  if (guestCount > hall.capacity) warnings.push(`${guestCount} guests is more than ${hall.name}'s capacity of ${hall.capacity}`);
  return warnings;
}

function holdWarnings(holds) {
  return holds.map((hold) => `Overlaps with ${hold.status} booking ${describeConflict(hold)}`);
}

/**
 * Closes the race window between "check the slot is free" and "save": after saving a booking that occupies the hall,
 * look again. If another confirmed booking now overlaps (saved concurrently), undo our write with `revert`.
 * Worst case both racing requests revert and the user retries — a double booking is never left behind.
 */
async function assertNoConflictAfterWrite(ctx, booking, settings, revert) {
  const { conflicts } = await checkAvailability(ctx, {
    hall: booking.hall,
    startAt: booking.startAt,
    endAt: booking.endAt,
    bufferMinutes: settings.booking.bufferMinutes,
    excludeId: booking._id,
    statuses: BLOCKING_BOOKING_STATUSES,
  });
  if (conflicts.length) {
    await revert();
    throw conflictError(conflicts);
  }
}

async function get(ctx, id) {
  const booking = await Booking.findOne({ _id: id, organizationId: ctx.organizationId }).populate(DETAIL_POPULATE).lean();
  if (!booking) throw ApiError.notFound('Booking');
  return booking;
}

async function list(ctx, query) {
  const settings = await getSystemSettings(ctx.organizationId);
  const today = todayInTimeZone(settings.timezone);
  const filter = { organizationId: ctx.organizationId };

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    const customerIds = await Customer.find({ organizationId: ctx.organizationId, ...customerSearch(query.q) }).distinct('_id');
    filter.$or = [{ bookingNumber: pattern }, { title: pattern }, { customer: { $in: customerIds } }];
  }
  if (query.customer) filter.customer = query.customer;
  if (query.hall) filter.hall = query.hall;
  if (query.eventType?.length) filter.eventType = { $in: query.eventType };
  if (query.paymentStatus?.length) filter.paymentStatus = { $in: query.paymentStatus };

  let statuses = query.status?.length ? query.status : null;
  if (query.upcoming) statuses = (statuses ?? OPEN_BOOKING_STATUSES).filter((status) => OPEN_BOOKING_STATUSES.includes(status));
  if (query.hasBalance) {
    statuses = (statuses ?? BOOKING_STATUSES.map((status) => status.value)).filter((status) => status !== 'cancelled');
    filter['totals.balance'] = { $gt: MONEY_EPSILON };
  }
  if (statuses) filter.status = { $in: statuses };

  const eventDate = {};
  if (query.from) eventDate.$gte = query.from;
  if (query.upcoming && (!eventDate.$gte || eventDate.$gte < today)) eventDate.$gte = today;
  if (query.to) eventDate.$lte = query.to;
  if (Object.keys(eventDate).length) filter.eventDate = eventDate;

  const fallbackSort = query.upcoming ? { startAt: 1 } : { startAt: -1 };
  return paginate(Booking, filter, {
    page: query.page,
    limit: query.limit,
    sort: buildSort(query.sort, SORTABLE, fallbackSort),
    populate: LIST_POPULATE,
    select: '-statusHistory -menu.items -services',
  });
}

async function create(ctx, input) {
  const [settings, business] = await Promise.all([getSystemSettings(ctx.organizationId), getBusinessSettings(ctx.organizationId)]);
  const [customer, hall] = await Promise.all([loadCustomer(ctx, input.customer), loadHall(ctx, input.hall)]);
  const today = todayInTimeZone(settings.timezone);
  const warnings = hallWarnings(hall, input.guestCount);

  if (input.status === 'completed' && input.eventDate > today) {
    throw invalid('status', 'An event can only be marked as completed once its date has passed');
  }
  if (input.eventDate < today && input.status !== 'completed') warnings.push('The event date is in the past');

  const { startAt, endAt } = eventWindow(input.eventDate, input.startTime, input.endTime, settings.timezone);
  const { menu, warnings: menuWarnings } = await buildBookingMenu(ctx, input.menu, input.guestCount);
  warnings.push(...menuWarnings);

  const charges = {
    hall: input.charges?.hall ?? hall.basePrice,
    decoration: input.charges?.decoration ?? 0,
    other: input.charges?.other ?? 0,
    discount: input.charges?.discount ?? 0,
    taxRate: input.charges?.taxRate ?? business.tax?.defaultRate ?? 0,
  };
  const draft = { guestCount: input.guestCount, menu, services: priceServices(input.services), charges };
  const { totals, paymentStatus } = computeFinancials(draft, { paid: 0, refunded: 0 });
  assertFinanceValid(draft, totals);

  if (input.advancePayment && !settings.payments?.allowOverpayment && input.advancePayment.amount > totals.grandTotal + MONEY_EPSILON) {
    throw invalid('advancePayment.amount', `The advance cannot be more than the total of ${formatMoney(totals.grandTotal, business.currency)}`);
  }

  const availability = await checkAvailability(ctx, { hall: hall._id, startAt, endAt, bufferMinutes: settings.booking.bufferMinutes });
  if (isBlocking(input.status) && !availability.available) throw conflictError(availability.conflicts);
  warnings.push(...holdWarnings(availability.holds));
  if (!isBlocking(input.status) && !availability.available) {
    warnings.push(`The hall is already confirmed for ${availability.conflicts.map(describeConflict).join('; ')} — this booking cannot be confirmed unless that changes`);
  }

  const bookingNumber = await nextDocumentNumber(ctx.organizationId, { prefix: 'BK', year: today.getUTCFullYear(), sequenceKey: 'booking' });
  const now = new Date();
  const booking = await Booking.create({
    organizationId: ctx.organizationId,
    bookingNumber,
    customer: customer._id,
    hall: hall._id,
    eventType: input.eventType,
    title: input.title,
    eventDate: input.eventDate,
    startTime: input.startTime,
    endTime: input.endTime,
    startAt,
    endAt,
    guestCount: input.guestCount,
    ...draft,
    totals,
    paymentStatus,
    status: input.status,
    statusHistory: [{ to: input.status, at: now, by: ctx.userId, note: 'Booking created' }],
    notes: input.notes,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  if (isBlocking(booking.status)) {
    await assertNoConflictAfterWrite(ctx, booking, settings, () => Booking.deleteOne({ _id: booking._id }));
  }

  await recordAudit(ctx, {
    action: 'booking.created',
    entity: { kind: 'booking', id: booking._id, label: bookingNumber },
    summary: `New ${labelOf(EVENT_TYPES, booking.eventType)} booking ${bookingNumber} for ${customer.fullName} at ${hall.name} on ${formatDateOnly(booking.eventDate)} (${formatMoney(totals.grandTotal, business.currency)})`,
  });

  if (input.advancePayment) {
    await paymentsService.receive(ctx, { booking: booking._id, type: 'advance', ...input.advancePayment });
  }

  return { booking: await get(ctx, booking._id), warnings };
}

async function applyUpdate(ctx, id, input) {
  const booking = await Booking.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!booking) throw ApiError.notFound('Booking');
  if (booking.status === 'cancelled') throw ApiError.badRequest('A cancelled booking cannot be edited. Reinstate it first.');

  const [settings, business] = await Promise.all([getSystemSettings(ctx.organizationId), getBusinessSettings(ctx.organizationId)]);
  const collected = await collectedFor(ctx.organizationId, booking._id);
  const hasPayments = collected.paid > 0 || collected.refunded > 0;
  const warnings = [];

  if (input.customer && String(input.customer) !== String(booking.customer)) {
    if (hasPayments) throw invalid('customer', 'The customer cannot be changed after payments have been received');
    await loadCustomer(ctx, input.customer);
  }
  const hallChanged = input.hall && String(input.hall) !== String(booking.hall);
  const hall = await (hallChanged ? loadHall(ctx, input.hall) : Hall.findById(booking.hall).lean());

  const next = {
    hall: hall._id,
    eventDate: input.eventDate ?? booking.eventDate,
    startTime: input.startTime ?? booking.startTime,
    endTime: input.endTime ?? booking.endTime,
    guestCount: input.guestCount ?? booking.guestCount,
  };
  const windowChanged =
    hallChanged ||
    formatDateOnly(next.eventDate) !== formatDateOnly(booking.eventDate) ||
    next.startTime !== booking.startTime ||
    next.endTime !== booking.endTime;
  const { startAt, endAt } = eventWindow(next.eventDate, next.startTime, next.endTime, settings.timezone);
  if (hallChanged || input.guestCount) warnings.push(...hallWarnings(hall, next.guestCount));

  const existing = booking.toObject();
  let menu = existing.menu;
  if (input.menu) {
    const built = await buildBookingMenu(ctx, input.menu, next.guestCount, existing.menu);
    menu = built.menu;
    warnings.push(...built.warnings);
  }
  const services = input.services ? priceServices(input.services) : existing.services;
  const charges = { ...existing.charges, ...Object.fromEntries(Object.entries(input.charges ?? {}).filter(([, value]) => value !== undefined)) };
  const draft = { guestCount: next.guestCount, menu, services, charges };
  const { totals, paymentStatus } = computeFinancials(draft, collected);
  assertFinanceValid(draft, totals);

  if (!settings.payments?.allowOverpayment && totals.balance < -MONEY_EPSILON) {
    throw invalid(
      'charges',
      `The new total (${formatMoney(totals.grandTotal, business.currency)}) is less than the ${formatMoney(totals.netPaid, business.currency)} already paid. Record a refund first.`,
    );
  }

  if (windowChanged) {
    const availability = await checkAvailability(ctx, { hall: hall._id, startAt, endAt, bufferMinutes: settings.booking.bufferMinutes, excludeId: booking._id });
    if (isBlocking(booking.status) && !availability.available) throw conflictError(availability.conflicts);
    warnings.push(...holdWarnings(availability.holds));
  }

  const auditFields = (doc) => ({
    customer: String(doc.customer),
    hall: String(doc.hall),
    eventType: doc.eventType,
    title: doc.title,
    eventDate: formatDateOnly(doc.eventDate),
    startTime: doc.startTime,
    endTime: doc.endTime,
    guestCount: doc.guestCount,
    menu: doc.menu?.mode === 'package' ? `${doc.menu.package?.name} @ ${doc.menu.package?.rate}` : doc.menu?.mode,
    charges: doc.charges,
    grandTotal: doc.totals?.grandTotal,
    notes: doc.notes,
  });
  const before = auditFields(existing);
  const previousWindow = { hall: existing.hall, eventDate: existing.eventDate, startTime: existing.startTime, endTime: existing.endTime, startAt: existing.startAt, endAt: existing.endAt };

  booking.set({
    ...(input.customer ? { customer: input.customer } : {}),
    ...(input.eventType ? { eventType: input.eventType } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...next,
    startAt,
    endAt,
    menu,
    services,
    charges,
    totals,
    paymentStatus,
    updatedBy: ctx.userId,
  });
  await booking.save();

  if (windowChanged && isBlocking(booking.status)) {
    await assertNoConflictAfterWrite(ctx, booking, settings, async () => {
      booking.set(previousWindow);
      await booking.save();
    });
  }

  await recordAudit(ctx, {
    action: 'booking.updated',
    entity: { kind: 'booking', id: booking._id, label: booking.bookingNumber },
    summary: `Updated booking ${booking.bookingNumber}`,
    before,
    after: auditFields(booking.toObject()),
  });
  return { booking: await get(ctx, booking._id), warnings };
}

async function applyStatusChange(ctx, id, { status, note, reason }) {
  const booking = await Booking.findOne({ _id: id, organizationId: ctx.organizationId }).populate('customer', 'fullName');
  if (!booking) throw ApiError.notFound('Booking');
  const from = booking.status;
  if (from === status) throw ApiError.badRequest(`This booking is already ${labelOf(BOOKING_STATUSES, status).toLowerCase()}`);
  if (!BOOKING_STATUS_TRANSITIONS[from].includes(status)) {
    throw ApiError.badRequest(`A ${labelOf(BOOKING_STATUSES, from).toLowerCase()} booking cannot be changed to ${labelOf(BOOKING_STATUSES, status).toLowerCase()}`);
  }

  const settings = await getSystemSettings(ctx.organizationId);
  if (status === 'completed' && booking.eventDate > todayInTimeZone(settings.timezone)) {
    throw ApiError.badRequest("This event hasn't taken place yet, so it can't be marked as completed");
  }
  const becomesBlocking = isBlocking(status) && !isBlocking(from);
  if (becomesBlocking) {
    const availability = await checkAvailability(ctx, {
      hall: booking.hall,
      startAt: booking.startAt,
      endAt: booking.endAt,
      bufferMinutes: settings.booking.bufferMinutes,
      excludeId: booking._id,
      statuses: BLOCKING_BOOKING_STATUSES,
    });
    if (!availability.available) throw conflictError(availability.conflicts);
  }

  const previousCancellation = booking.cancellation?.toObject?.();
  booking.status = status;
  booking.statusHistory.push({ from, to: status, at: new Date(), by: ctx.userId, note: reason || note });
  if (status === 'cancelled') booking.cancellation = { reason, at: new Date(), by: ctx.userId };
  if (from === 'cancelled') booking.cancellation = undefined;
  booking.updatedBy = ctx.userId;
  await booking.save();

  if (becomesBlocking) {
    await assertNoConflictAfterWrite(ctx, booking, settings, async () => {
      booking.status = from;
      booking.statusHistory.pop();
      booking.cancellation = previousCancellation;
      await booking.save();
    });
  }

  const verb = { confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', tentative: 'Marked as tentative', inquiry: 'Moved back to inquiry' }[status];
  await recordAudit(ctx, {
    action: `booking.${status}`,
    entity: { kind: 'booking', id: booking._id, label: booking.bookingNumber },
    summary: `${verb} booking ${booking.bookingNumber} for ${booking.customer.fullName}${reason ? ` — ${reason}` : ''}`,
    before: { status: from },
    after: { status },
  });
  return get(ctx, booking._id);
}

/** Edits a booking. Runs under the booking lock so a concurrent payment can't slip under a reduced total. */
function update(ctx, id, input) {
  return withBookingLock(ctx.organizationId, id, () => applyUpdate(ctx, id, input));
}

/** Moves a booking through its workflow (confirm, complete, cancel, reinstate). */
function changeStatus(ctx, id, input) {
  return withBookingLock(ctx.organizationId, id, () => applyStatusChange(ctx, id, input));
}

/** Lightweight events for the calendar views. */
async function calendar(ctx, { from, to, hall, includeCancelled }) {
  return Booking.find({
    organizationId: ctx.organizationId,
    eventDate: { $gte: from, $lte: to },
    ...(hall ? { hall } : {}),
    ...(includeCancelled ? {} : { status: { $ne: 'cancelled' } }),
  })
    .select('bookingNumber eventType title eventDate startTime endTime startAt endAt status paymentStatus guestCount totals.grandTotal totals.balance customer hall')
    .populate(LIST_POPULATE)
    .sort({ startAt: 1 })
    .lean();
}

/** Live availability check used by the booking form while the user picks hall/date/time. */
async function availabilityFor(ctx, { hall: hallId, eventDate, startTime, endTime, excludeBooking }) {
  const settings = await getSystemSettings(ctx.organizationId);
  const hall = await Hall.findOne({ _id: hallId, organizationId: ctx.organizationId }).select('name capacity status').lean();
  if (!hall) throw invalid('hall', 'Choose a valid hall');
  const { startAt, endAt } = eventWindow(eventDate, startTime, endTime, settings.timezone);
  const result = await checkAvailability(ctx, { hall: hall._id, startAt, endAt, bufferMinutes: settings.booking.bufferMinutes, excludeId: excludeBooking });
  return { ...result, hall, bufferMinutes: settings.booking.bufferMinutes, endsNextDay: endTime <= startTime };
}

/** Marks confirmed events as completed once they have ended (scheduler, when enabled in settings). */
async function autoCompleteFinishedEvents(organizationId, now = new Date()) {
  const result = await Booking.updateMany(
    { organizationId, status: 'confirmed', endAt: { $lt: now } },
    {
      $set: { status: 'completed' },
      $push: { statusHistory: { from: 'confirmed', to: 'completed', at: now, note: 'Completed automatically after the event ended' } },
    },
  );
  return result.modifiedCount;
}

module.exports = { list, get, create, update, changeStatus, calendar, availabilityFor, autoCompleteFinishedEvents };
