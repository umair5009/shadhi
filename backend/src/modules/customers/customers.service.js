const { Customer, Booking } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, escapeRegex, dateRangeFilter } = require('../../utils/listQuery');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings } = require('../../services/settings');
const { todayInTimeZone } = require('../../utils/dates');
const { OPEN_BOOKING_STATUSES, MONEY_EPSILON } = require('../../config/shared');

const SORTABLE = { fullName: 'fullName', createdAt: 'createdAt', city: 'city' };

/** Name / phone / email / CNIC search. Phone matching ignores spaces, dashes and +92. */
function customerSearch(q) {
  if (!q) return {};
  const conditions = [
    { fullName: new RegExp(escapeRegex(q), 'i') },
    { email: new RegExp(escapeRegex(q), 'i') },
    { cnic: new RegExp(escapeRegex(q), 'i') },
  ];
  const digits = Customer.phoneDigits(q);
  if (digits.length >= 3) conditions.push({ phoneDigits: new RegExp(escapeRegex(digits)) }, { alternatePhone: new RegExp(escapeRegex(q)) });
  return { $or: conditions };
}

/** Per-customer booking totals. Cancelled bookings don't count towards what is owed. */
async function statsFor(organizationId, customerIds, today) {
  const rows = await Booking.aggregate([
    { $match: { organizationId, customer: { $in: customerIds } } },
    {
      $group: {
        _id: '$customer',
        bookings: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        upcoming: {
          $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', today] }, { $in: ['$status', OPEN_BOOKING_STATUSES] }] }, 1, 0] },
        },
        totalBilled: { $sum: { $cond: [{ $ne: ['$status', 'cancelled'] }, '$totals.grandTotal', 0] } },
        totalPaid: { $sum: '$totals.netPaid' },
        outstanding: {
          $sum: { $cond: [{ $and: [{ $ne: ['$status', 'cancelled'] }, { $gt: ['$totals.balance', 0] }] }, '$totals.balance', 0] },
        },
        lastEventDate: { $max: '$eventDate' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

const EMPTY_STATS = { bookings: 0, cancelled: 0, upcoming: 0, totalBilled: 0, totalPaid: 0, outstanding: 0, lastEventDate: null };

async function list(ctx, query) {
  const { timezone } = await getSystemSettings(ctx.organizationId);
  const filter = {
    organizationId: ctx.organizationId,
    ...customerSearch(query.q),
    ...(query.city ? { city: new RegExp(`^${escapeRegex(query.city)}$`, 'i') } : {}),
  };

  // Filtering by event type / event date / outstanding balance works through the customer's bookings.
  if (query.eventType?.length || query.from || query.to || query.hasBalance) {
    const bookingFilter = {
      organizationId: ctx.organizationId,
      ...(query.eventType?.length ? { eventType: { $in: query.eventType } } : {}),
      ...dateRangeFilter('eventDate', query.from, query.to),
      ...(query.hasBalance ? { status: { $ne: 'cancelled' }, 'totals.balance': { $gt: MONEY_EPSILON } } : {}),
    };
    filter._id = { $in: await Booking.distinct('customer', bookingFilter) };
  }

  const sort = buildSort(query.sort, SORTABLE, { createdAt: -1 });
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort(sort).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Customer.countDocuments(filter),
  ]);
  const stats = await statsFor(ctx.organizationId, customers.map((customer) => customer._id), todayInTimeZone(timezone));
  return {
    data: customers.map((customer) => ({ ...customer, stats: stats.get(String(customer._id)) ?? EMPTY_STATS })),
    meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

/** Quick search for the booking form: best matches by phone or name. */
async function lookup(ctx, { q }) {
  return Customer.find({ organizationId: ctx.organizationId, ...customerSearch(q) })
    .select('fullName phone alternatePhone city email')
    .sort({ fullName: 1 })
    .limit(10)
    .lean();
}

async function findCustomer(ctx, id) {
  const customer = await Customer.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!customer) throw ApiError.notFound('Customer');
  return customer;
}

/** Customer profile: details, financial summary and full event history. */
async function get(ctx, id) {
  const customer = (await findCustomer(ctx, id)).toJSON();
  const { timezone } = await getSystemSettings(ctx.organizationId);
  const [stats, bookings] = await Promise.all([
    statsFor(ctx.organizationId, [customer._id], todayInTimeZone(timezone)),
    Booking.find({ organizationId: ctx.organizationId, customer: customer._id })
      .select('bookingNumber eventType title eventDate startTime endTime hall guestCount totals status paymentStatus')
      .populate('hall', 'name color')
      .sort({ eventDate: -1 })
      .lean(),
  ]);
  return { ...customer, stats: stats.get(String(customer._id)) ?? EMPTY_STATS, bookings };
}

async function assertPhoneFree(ctx, phone, excludeId) {
  const existing = await Customer.findOne({
    organizationId: ctx.organizationId,
    phoneDigits: Customer.phoneDigits(phone),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })
    .select('fullName')
    .lean();
  if (existing) {
    // existingCustomerId lets the web app offer "open the existing customer" instead of a dead end.
    throw ApiError.conflict(
      `This phone number already belongs to ${existing.fullName}`,
      [{ field: 'phone', message: `Already used by ${existing.fullName}`, existingCustomerId: String(existing._id) }],
      'DUPLICATE',
    );
  }
}

async function create(ctx, input) {
  await assertPhoneFree(ctx, input.phone);
  const customer = await Customer.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, {
    action: 'customer.created',
    entity: { kind: 'customer', id: customer._id, label: customer.fullName },
    summary: `Added customer ${customer.fullName} (${customer.phone})`,
  });
  return customer.toJSON();
}

async function update(ctx, id, input) {
  const customer = await findCustomer(ctx, id);
  if (input.phone) await assertPhoneFree(ctx, input.phone, customer._id);
  const before = customer.toJSON();
  customer.set({ ...input, updatedBy: ctx.userId });
  await customer.save();
  await recordAudit(ctx, {
    action: 'customer.updated',
    entity: { kind: 'customer', id: customer._id, label: customer.fullName },
    summary: `Updated customer ${customer.fullName}`,
    before,
    after: customer.toJSON(),
  });
  return customer.toJSON();
}

async function remove(ctx, id) {
  const customer = await findCustomer(ctx, id);
  const bookings = await Booking.countDocuments({ organizationId: ctx.organizationId, customer: customer._id });
  if (bookings) throw ApiError.conflict(`${customer.fullName} has ${bookings} booking(s) on record. Customers with bookings are kept for history.`);
  await customer.deleteOne();
  await recordAudit(ctx, { action: 'customer.deleted', entity: { kind: 'customer', id: customer._id, label: customer.fullName }, summary: `Deleted customer ${customer.fullName}` });
}

module.exports = { list, lookup, get, create, update, remove, customerSearch };
