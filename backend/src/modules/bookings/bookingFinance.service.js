const { Booking, Payment } = require('../../models');
const { calculateBookingTotals } = require('../../config/shared');

/** Sums non-voided payments and refunds for one booking straight from the payment ledger. */
async function collectedFor(organizationId, bookingId) {
  const [row] = await Payment.aggregate([
    { $match: { organizationId, booking: bookingId, void: { $exists: false } } },
    {
      $group: {
        _id: null,
        paid: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 0, '$amount'] } },
        refunded: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
      },
    },
  ]);
  return { paid: row?.paid ?? 0, refunded: row?.refunded ?? 0 };
}

/** Totals + payment status for a booking-shaped object and what has been collected on it. */
function computeFinancials(booking, collected) {
  const { paymentStatus, taxRate: _taxRate, ...totals } = calculateBookingTotals(booking, collected);
  return { totals, paymentStatus };
}

/**
 * Recomputes a booking's totals from its own charges and the payment ledger, and stores them.
 * Idempotent and self-healing: whatever happened before, after this call the booking agrees with its payments.
 * @returns {Promise<object>} the updated booking (lean)
 */
async function refreshBookingFinancials(organizationId, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, organizationId }).lean();
  if (!booking) return null;
  const collected = await collectedFor(organizationId, booking._id);
  const { totals, paymentStatus } = computeFinancials(booking, collected);
  return Booking.findOneAndUpdate(
    { _id: booking._id, organizationId },
    { $set: { totals, paymentStatus } },
    { returnDocument: 'after' },
  ).lean();
}

module.exports = { collectedFor, computeFinancials, refreshBookingFinancials };
