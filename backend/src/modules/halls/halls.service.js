const { Hall, Booking } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, searchFilter } = require('../../utils/listQuery');
const { eventWindow, todayInTimeZone, startOfMonthDateOnly, endOfMonthDateOnly } = require('../../utils/dates');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings } = require('../../services/settings');
const storage = require('../../services/storage');
const { checkAvailability } = require('../bookings/bookingConflicts');
const { OPEN_BOOKING_STATUSES } = require('../../config/shared');

const SORTABLE = { name: 'name', capacity: 'capacity', basePrice: 'basePrice', createdAt: 'createdAt' };
const MAX_IMAGES = 8;

async function findHall(ctx, id) {
  const hall = await Hall.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!hall) throw ApiError.notFound('Hall');
  return hall;
}

async function list(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'description']),
    ...(query.status?.length ? { status: { $in: query.status } } : {}),
  };
  return paginate(Hall, filter, { page: query.page, limit: query.limit, sort: buildSort(query.sort, SORTABLE, { name: 1 }) });
}

/** Hall with headline numbers for its detail page. */
async function get(ctx, id) {
  const hall = (await findHall(ctx, id)).toJSON();
  const { timezone } = await getSystemSettings(ctx.organizationId);
  const today = todayInTimeZone(timezone);
  const [stats] = await Booking.aggregate([
    { $match: { organizationId: ctx.organizationId, hall: hall._id, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        upcomingEvents: { $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', today] }, { $in: ['$status', OPEN_BOOKING_STATUSES] }] }, 1, 0] } },
        eventsThisMonth: {
          $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', startOfMonthDateOnly(today)] }, { $lte: ['$eventDate', endOfMonthDateOnly(today)] }] }, 1, 0] },
        },
        bookedValue: { $sum: '$totals.grandTotal' },
      },
    },
  ]);
  return { ...hall, stats: stats ?? { totalEvents: 0, upcomingEvents: 0, eventsThisMonth: 0, bookedValue: 0 } };
}

async function create(ctx, input) {
  const hall = await Hall.create({ ...input, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'hall.created', entity: { kind: 'hall', id: hall._id, label: hall.name }, summary: `Added hall ${hall.name}` });
  return hall.toJSON();
}

async function update(ctx, id, input) {
  const hall = await findHall(ctx, id);
  const before = hall.toJSON();
  hall.set({ ...input, updatedBy: ctx.userId });
  await hall.save();
  await recordAudit(ctx, { action: 'hall.updated', entity: { kind: 'hall', id: hall._id, label: hall.name }, summary: `Updated hall ${hall.name}`, before, after: hall.toJSON() });
  return hall.toJSON();
}

async function remove(ctx, id) {
  const hall = await findHall(ctx, id);
  const bookings = await Booking.countDocuments({ organizationId: ctx.organizationId, hall: hall._id });
  if (bookings) {
    throw ApiError.conflict(`${hall.name} has ${bookings} booking(s) on record and cannot be deleted. Set its status to Inactive instead.`);
  }
  await hall.deleteOne();
  await Promise.all(hall.images.map((image) => storage.removeFile(image.key)));
  await recordAudit(ctx, { action: 'hall.deleted', entity: { kind: 'hall', id: hall._id, label: hall.name }, summary: `Deleted hall ${hall.name}` });
}

async function addImages(ctx, id, files) {
  const hall = await findHall(ctx, id);
  if (!files?.length) throw ApiError.badRequest('Choose at least one image');
  if (hall.images.length + files.length > MAX_IMAGES) throw ApiError.badRequest(`A hall can have up to ${MAX_IMAGES} photos`);
  const saved = [];
  for (const file of files) saved.push(await storage.saveFile(ctx.organizationId, file, { imagesOnly: true }));
  hall.images.push(...saved);
  hall.updatedBy = ctx.userId;
  await hall.save();
  return hall.toJSON();
}

async function removeImage(ctx, id, key) {
  const hall = await findHall(ctx, id);
  const image = hall.images.find((entry) => entry.key === key);
  if (!image) throw ApiError.notFound('Photo');
  hall.images.pull({ key });
  hall.updatedBy = ctx.userId;
  await hall.save();
  await storage.removeFile(key);
  return hall.toJSON();
}

/**
 * Which halls are free for a date and time slot.
 * status: available | held (only inquiries/tentative overlap) | booked (a confirmed event overlaps) | unavailable
 */
async function availability(ctx, { date, startTime, endTime, excludeBooking }) {
  const settings = await getSystemSettings(ctx.organizationId);
  const { startAt, endAt } = eventWindow(date, startTime, endTime, settings.timezone);
  const halls = await Hall.find({ organizationId: ctx.organizationId, status: { $ne: 'inactive' } }).sort({ name: 1 }).lean();

  return Promise.all(
    halls.map(async (hall) => {
      const result = await checkAvailability(ctx, {
        hall: hall._id,
        startAt,
        endAt,
        bufferMinutes: settings.booking.bufferMinutes,
        excludeId: excludeBooking,
      });
      let status = 'available';
      if (hall.status === 'maintenance') status = 'unavailable';
      else if (!result.available) status = 'booked';
      else if (result.holds.length) status = 'held';
      return {
        hall: { _id: hall._id, name: hall.name, capacity: hall.capacity, basePrice: hall.basePrice, color: hall.color, status: hall.status },
        status,
        conflicts: result.conflicts,
        holds: result.holds,
      };
    }),
  );
}

module.exports = { list, get, create, update, remove, addImages, removeImage, availability };
