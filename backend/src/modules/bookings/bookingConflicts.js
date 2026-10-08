const { Booking } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { BLOCKING_BOOKING_STATUSES, OPEN_BOOKING_STATUSES } = require('../../config/shared');

const MINUTE_MS = 60 * 1000;

/**
 * Bookings in the same hall whose time window (padded by the setup/cleaning buffer) overlaps [startAt, endAt).
 * @param {object} ctx
 * @param {object} window
 * @param {unknown} window.hall
 * @param {Date} window.startAt
 * @param {Date} window.endAt
 * @param {number} window.bufferMinutes
 * @param {unknown} [window.excludeId] the booking being edited
 * @param {string[]} [window.statuses]
 */
async function findOverlappingBookings(ctx, { hall, startAt, endAt, bufferMinutes = 0, excludeId, statuses }) {
  const buffer = bufferMinutes * MINUTE_MS;
  return Booking.find({
    organizationId: ctx.organizationId,
    hall,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    status: { $in: statuses ?? [...new Set([...BLOCKING_BOOKING_STATUSES, ...OPEN_BOOKING_STATUSES])] },
    startAt: { $lt: new Date(endAt.getTime() + buffer) },
    endAt: { $gt: new Date(startAt.getTime() - buffer) },
  })
    .select('bookingNumber status eventType eventDate startTime endTime startAt endAt customer createdAt')
    .populate('customer', 'fullName phone')
    .sort({ startAt: 1 })
    .lean();
}

/**
 * Splits overlaps into hard conflicts (another confirmed/completed booking — never allowed alongside a confirmed
 * booking) and soft holds (inquiries/tentative bookings — shown as warnings).
 */
async function checkAvailability(ctx, window) {
  const overlaps = await findOverlappingBookings(ctx, window);
  const conflicts = overlaps.filter((booking) => BLOCKING_BOOKING_STATUSES.includes(booking.status));
  const holds = overlaps.filter((booking) => !BLOCKING_BOOKING_STATUSES.includes(booking.status));
  return { available: conflicts.length === 0, conflicts, holds };
}

function describeConflict(booking) {
  const customer = booking.customer?.fullName ? ` for ${booking.customer.fullName}` : '';
  return `${booking.bookingNumber}${customer} (${booking.startTime}–${booking.endTime}, ${booking.status})`;
}

/** 409 error listing the confirmed bookings that occupy the slot. */
function conflictError(conflicts) {
  return ApiError.conflict(
    `This hall is already booked at that time: ${conflicts.map(describeConflict).join('; ')}`,
    conflicts.map((booking) => ({
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      customer: booking.customer?.fullName,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
    })),
    'BOOKING_CONFLICT',
  );
}

module.exports = { findOverlappingBookings, checkAvailability, describeConflict, conflictError };
