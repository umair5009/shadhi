const { Types } = require('mongoose');
const { Booking } = require('../../models');
const ApiError = require('../../utils/ApiError');

// Serialises money-changing work on one booking (payments, refunds, voids, edits, status changes).
// Each operation reads the payment ledger, validates, writes, and recomputes totals while holding the lock, so two
// people working on the same booking at the same moment can never produce an overpayment or a total below what was
// paid. Works on a standalone MongoDB — no replica-set transactions needed. A lock left behind by a crashed request
// expires after LOCK_TTL_MS.

const LOCK_TTL_MS = 15 * 1000;
const WAIT_LIMIT_MS = 10 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `work` while holding the booking's lock.
 * @template T
 * @param {import('mongoose').Types.ObjectId} organizationId
 * @param {import('mongoose').Types.ObjectId|string} bookingId
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withBookingLock(organizationId, bookingId, work) {
  const token = new Types.ObjectId();
  const giveUpAt = Date.now() + WAIT_LIMIT_MS;

  for (let attempt = 1; ; attempt += 1) {
    const now = new Date();
    const acquired = await Booking.updateOne(
      { _id: bookingId, organizationId, $or: [{ 'lock.until': { $exists: false } }, { 'lock.until': { $lt: now } }] },
      { $set: { lock: { token, until: new Date(now.getTime() + LOCK_TTL_MS) } } },
      { timestamps: false },
    );
    if (acquired.matchedCount === 1) break;
    if (!(await Booking.exists({ _id: bookingId, organizationId }))) throw ApiError.notFound('Booking');
    if (Date.now() > giveUpAt) {
      throw ApiError.conflict('Someone else is updating this booking right now. Please try again in a moment.', undefined, 'BOOKING_BUSY');
    }
    await sleep(Math.min(200, 15 * attempt) + Math.random() * 25);
  }

  try {
    return await work();
  } finally {
    await Booking.updateOne({ _id: bookingId, 'lock.token': token }, { $unset: { lock: 1 } }, { timestamps: false });
  }
}

module.exports = { withBookingLock };
