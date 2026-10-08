const { Payment, Booking, Customer } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, escapeRegex, dateRangeFilter } = require('../../utils/listQuery');
const { nextDocumentNumber } = require('../../services/numbering');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings, getBusinessSettings } = require('../../services/settings');
const { todayInTimeZone } = require('../../utils/dates');
const { collectedFor, computeFinancials, refreshBookingFinancials } = require('../bookings/bookingFinance.service');
const { withBookingLock } = require('../bookings/bookingLock');
const { customerSearch } = require('../customers/customers.service');
const { MONEY_EPSILON, suggestPaymentType, formatMoney, labelOf, PAYMENT_METHODS } = require('../../config/shared');

const SORTABLE = { paidOn: 'paidOn', amount: 'amount', receiptNumber: 'receiptNumber', createdAt: 'createdAt' };
const POPULATE = [
  { path: 'customer', select: 'fullName phone' },
  { path: 'booking', select: 'bookingNumber eventType eventDate hall totals status', populate: { path: 'hall', select: 'name' } },
  { path: 'receivedBy', select: 'name' },
  { path: 'void.by', select: 'name' },
];

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);

async function get(ctx, id) {
  const payment = await Payment.findOne({ _id: id, organizationId: ctx.organizationId }).populate(POPULATE).lean();
  if (!payment) throw ApiError.notFound('Payment');
  return payment;
}

/** Fresh booking + its ledger totals. Must be called while holding the booking lock. */
async function loadBookingState(ctx, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, organizationId: ctx.organizationId }).populate('customer', 'fullName phone').lean();
  if (!booking) throw invalid('booking', 'Choose a valid booking');
  const collected = await collectedFor(ctx.organizationId, booking._id);
  return { booking, current: computeFinancials(booking, collected).totals };
}

async function createPaymentRecord(ctx, booking, fields) {
  const [business, system] = await Promise.all([getBusinessSettings(ctx.organizationId), getSystemSettings(ctx.organizationId)]);
  const paidOn = fields.paidOn ?? todayInTimeZone(system.timezone);
  const receiptNumber = await nextDocumentNumber(ctx.organizationId, {
    prefix: business.invoice?.receiptPrefix ?? 'RCP',
    year: paidOn.getUTCFullYear(),
    sequenceKey: 'receipt',
  });
  const payment = await Payment.create({
    ...fields,
    paidOn,
    receiptNumber,
    organizationId: ctx.organizationId,
    booking: booking._id,
    customer: booking.customer._id,
    receivedBy: ctx.userId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  await refreshBookingFinancials(ctx.organizationId, booking._id);
  return { payment, currency: business.currency };
}

/** Receives money against a booking. Never more than the remaining balance unless overpayment is enabled. */
async function receive(ctx, input) {
  const { payment, booking, currency } = await withBookingLock(ctx.organizationId, input.booking, async () => {
    const { booking, current } = await loadBookingState(ctx, input.booking);
    if (booking.status === 'cancelled') throw ApiError.conflict('This booking is cancelled. Only refunds can be recorded against it.');

    const system = await getSystemSettings(ctx.organizationId);
    if (!system.payments?.allowOverpayment && input.amount > current.balance + MONEY_EPSILON) {
      const { currency } = await getBusinessSettings(ctx.organizationId);
      throw invalid(
        'amount',
        current.balance <= MONEY_EPSILON
          ? 'This booking is already fully paid'
          : `Amount is more than the remaining balance of ${formatMoney(current.balance, currency)}`,
      );
    }

    const created = await createPaymentRecord(ctx, booking, {
      type: input.type ?? suggestPaymentType(current, input.amount),
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference,
      notes: input.notes,
    });
    return { ...created, booking };
  });

  await recordAudit(ctx, {
    action: 'payment.received',
    entity: { kind: 'payment', id: payment._id, label: payment.receiptNumber },
    summary: `Received ${formatMoney(payment.amount, currency)} (${labelOf(PAYMENT_METHODS, payment.method)}) from ${booking.customer.fullName} for ${booking.bookingNumber}`,
    after: { receiptNumber: payment.receiptNumber, booking: booking.bookingNumber, type: payment.type, amount: payment.amount, method: payment.method },
  });
  return get(ctx, payment._id);
}

/** Returns money to the customer. Cannot exceed what they have paid (net of earlier refunds). */
async function refund(ctx, input) {
  const { payment, booking, currency } = await withBookingLock(ctx.organizationId, input.booking, async () => {
    const { booking, current } = await loadBookingState(ctx, input.booking);
    if (input.amount > current.netPaid + MONEY_EPSILON) {
      const { currency } = await getBusinessSettings(ctx.organizationId);
      throw invalid('amount', `A refund cannot be more than the ${formatMoney(Math.max(0, current.netPaid), currency)} paid so far`);
    }
    const created = await createPaymentRecord(ctx, booking, {
      type: 'refund',
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference,
      notes: input.notes,
    });
    return { ...created, booking };
  });

  await recordAudit(ctx, {
    action: 'payment.refunded',
    entity: { kind: 'payment', id: payment._id, label: payment.receiptNumber },
    summary: `Refunded ${formatMoney(payment.amount, currency)} to ${booking.customer.fullName} for ${booking.bookingNumber}: ${input.notes}`,
    after: { receiptNumber: payment.receiptNumber, booking: booking.bookingNumber, amount: payment.amount, method: payment.method },
  });
  return get(ctx, payment._id);
}

/** Marks a payment entered by mistake as void. The record stays; it no longer counts towards totals. */
async function voidPayment(ctx, id, { reason }) {
  const existing = await Payment.findOne({ _id: id, organizationId: ctx.organizationId }).select('booking').lean();
  if (!existing) throw ApiError.notFound('Payment');

  const { payment, booking } = await withBookingLock(ctx.organizationId, existing.booking, async () => {
    const payment = await Payment.findById(existing._id);
    if (payment.void?.at) throw ApiError.badRequest('This payment is already void');
    payment.void = { at: new Date(), by: ctx.userId, reason };
    payment.updatedBy = ctx.userId;
    await payment.save();
    const booking = await refreshBookingFinancials(ctx.organizationId, payment.booking);
    return { payment, booking };
  });

  const { currency } = await getBusinessSettings(ctx.organizationId);
  await recordAudit(ctx, {
    action: 'payment.voided',
    entity: { kind: 'payment', id: payment._id, label: payment.receiptNumber },
    summary: `Voided ${payment.type === 'refund' ? 'refund' : 'payment'} ${payment.receiptNumber} of ${formatMoney(payment.amount, currency)} on ${booking?.bookingNumber}: ${reason}`,
  });
  return get(ctx, payment._id);
}

async function buildFilter(ctx, query) {
  const filter = { organizationId: ctx.organizationId };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    const [customerIds, bookingIds] = await Promise.all([
      Customer.find({ organizationId: ctx.organizationId, ...customerSearch(query.q) }).distinct('_id'),
      Booking.find({ organizationId: ctx.organizationId, bookingNumber: pattern }).distinct('_id'),
    ]);
    filter.$or = [{ receiptNumber: pattern }, { reference: pattern }, { customer: { $in: customerIds } }, { booking: { $in: bookingIds } }];
  }
  if (query.booking) filter.booking = query.booking;
  if (query.customer) filter.customer = query.customer;
  if (query.method?.length) filter.method = { $in: query.method };
  if (query.type?.length) filter.type = { $in: query.type };
  Object.assign(filter, dateRangeFilter('paidOn', query.from, query.to));
  if (!query.includeVoided) filter.void = { $exists: false };
  return filter;
}

/** Paginated payments plus totals (received, refunded, net) for the whole filtered set. */
async function list(ctx, query) {
  const filter = await buildFilter(ctx, query);
  const [page, [summary]] = await Promise.all([
    paginate(Payment, filter, {
      page: query.page,
      limit: query.limit,
      sort: buildSort(query.sort, SORTABLE, { paidOn: -1, createdAt: -1 }),
      populate: POPULATE,
    }),
    Payment.aggregate([
      { $match: { ...filter, void: { $exists: false } } },
      {
        $group: {
          _id: null,
          received: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 0, '$amount'] } },
          refunded: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);
  const received = summary?.received ?? 0;
  const refunded = summary?.refunded ?? 0;
  return { ...page, summary: { received, refunded, net: received - refunded, count: summary?.count ?? 0 } };
}

module.exports = { get, receive, refund, voidPayment, list, POPULATE };
