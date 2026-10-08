const { Invoice, Booking, Payment, Customer } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, escapeRegex, dateRangeFilter } = require('../../utils/listQuery');
const { nextDocumentNumber } = require('../../services/numbering');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings, getBusinessSettings } = require('../../services/settings');
const { todayInTimeZone, addDays } = require('../../utils/dates');
const { customerSearch } = require('../customers/customers.service');
const { buildInvoiceSnapshot, invoiceFingerprint } = require('./invoiceSnapshot');
const { formatMoney } = require('../../config/shared');

const SORTABLE = { issueDate: 'issueDate', invoiceNumber: 'invoiceNumber', dueDate: 'dueDate', createdAt: 'createdAt' };

async function livePayments(ctx, bookingId) {
  return Payment.find({ organizationId: ctx.organizationId, booking: bookingId, void: { $exists: false } })
    .select('receiptNumber type amount method paidOn reference')
    .sort({ paidOn: 1, createdAt: 1 })
    .lean();
}

/** Invoice with the booking's current payments and balance, and whether the booking changed since it was issued. */
async function get(ctx, id) {
  const invoice = await Invoice.findOne({ _id: id, organizationId: ctx.organizationId })
    .populate('createdBy', 'name')
    .populate('void.by', 'name')
    .populate('supersededBy', 'invoiceNumber')
    .lean();
  if (!invoice) throw ApiError.notFound('Invoice');
  const [booking, payments] = await Promise.all([
    Booking.findById(invoice.booking).select('bookingNumber status totals paymentStatus eventDate startTime endTime guestCount hall').populate('hall', 'name').lean(),
    livePayments(ctx, invoice.booking),
  ]);
  return {
    ...invoice,
    booking: booking && { _id: booking._id, bookingNumber: booking.bookingNumber, status: booking.status, paymentStatus: booking.paymentStatus, totals: booking.totals },
    payments,
    isOutdated: Boolean(booking) && invoice.status === 'issued' && invoiceFingerprint(booking) !== invoiceFingerprint(invoice.snapshot),
  };
}

async function create(ctx, { booking: bookingId, dueDate, notes, replace }) {
  const booking = await Booking.findOne({ _id: bookingId, organizationId: ctx.organizationId })
    .populate('customer', 'fullName phone alternatePhone email address city cnic')
    .populate('hall', 'name')
    .lean();
  if (!booking) throw ApiError.unprocessable('Choose a valid booking', [{ field: 'booking', message: 'Choose a valid booking' }]);
  if (booking.status === 'cancelled') throw ApiError.badRequest('Invoices cannot be issued for cancelled bookings');

  const existing = await Invoice.findOne({ organizationId: ctx.organizationId, booking: booking._id, status: 'issued' });
  if (existing && !replace) {
    throw ApiError.conflict(`Invoice ${existing.invoiceNumber} already exists for this booking. Regenerate it to replace it.`, [{ invoiceId: existing._id, invoiceNumber: existing.invoiceNumber }], 'INVOICE_EXISTS');
  }

  const [business, system] = await Promise.all([getBusinessSettings(ctx.organizationId), getSystemSettings(ctx.organizationId)]);
  const issueDate = todayInTimeZone(system.timezone);
  const invoiceNumber = await nextDocumentNumber(ctx.organizationId, {
    prefix: business.invoice?.prefix ?? 'INV',
    year: issueDate.getUTCFullYear(),
    sequenceKey: 'invoice',
    startAt: business.invoice?.startingNumber ?? 1,
  });

  const invoice = await Invoice.create({
    organizationId: ctx.organizationId,
    invoiceNumber,
    booking: booking._id,
    customer: booking.customer._id,
    issueDate,
    dueDate: dueDate ?? addDays(issueDate, business.invoice?.dueDays ?? 7),
    notes,
    snapshot: buildInvoiceSnapshot(business, booking),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  if (existing) {
    existing.set({
      status: 'void',
      void: { at: new Date(), by: ctx.userId, reason: `Replaced by ${invoiceNumber}` },
      supersededBy: invoice._id,
      updatedBy: ctx.userId,
    });
    await existing.save();
  }

  await recordAudit(ctx, {
    action: 'invoice.generated',
    entity: { kind: 'invoice', id: invoice._id, label: invoiceNumber },
    summary: `Generated invoice ${invoiceNumber} for ${booking.customer.fullName} (${formatMoney(booking.totals.grandTotal, business.currency)})${existing ? `, replacing ${existing.invoiceNumber}` : ''}`,
  });
  return get(ctx, invoice._id);
}

async function voidInvoice(ctx, id, { reason }) {
  const invoice = await Invoice.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!invoice) throw ApiError.notFound('Invoice');
  if (invoice.status === 'void') throw ApiError.badRequest('This invoice is already void');
  invoice.set({ status: 'void', void: { at: new Date(), by: ctx.userId, reason }, updatedBy: ctx.userId });
  await invoice.save();
  await recordAudit(ctx, { action: 'invoice.voided', entity: { kind: 'invoice', id: invoice._id, label: invoice.invoiceNumber }, summary: `Voided invoice ${invoice.invoiceNumber}: ${reason}` });
  return get(ctx, invoice._id);
}

async function list(ctx, query) {
  const filter = { organizationId: ctx.organizationId };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    const customerIds = await Customer.find({ organizationId: ctx.organizationId, ...customerSearch(query.q) }).distinct('_id');
    filter.$or = [{ invoiceNumber: pattern }, { 'snapshot.event.bookingNumber': pattern }, { customer: { $in: customerIds } }];
  }
  if (query.customer) filter.customer = query.customer;
  if (query.status?.length) filter.status = { $in: query.status };
  Object.assign(filter, dateRangeFilter('issueDate', query.from, query.to));

  const bookingConditions = [];
  if (query.booking) bookingConditions.push({ booking: query.booking });
  // "Unpaid invoices" = invoices whose booking still has a balance.
  if (query.paymentStatus?.length) {
    const bookingIds = await Booking.find({ organizationId: ctx.organizationId, paymentStatus: { $in: query.paymentStatus } }).distinct('_id');
    bookingConditions.push({ booking: { $in: bookingIds } });
  }
  if (bookingConditions.length) filter.$and = bookingConditions;

  const sort = buildSort(query.sort, SORTABLE, { issueDate: -1, createdAt: -1 });
  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .select('-snapshot.menu -snapshot.services -snapshot.lines -snapshot.business -snapshot.terms -snapshot.footer')
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('booking', 'bookingNumber status paymentStatus totals.grandTotal totals.netPaid totals.balance')
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return { data: invoices, meta: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) } };
}

module.exports = { get, create, voidInvoice, list };
