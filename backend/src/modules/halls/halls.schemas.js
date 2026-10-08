const { z, requiredText, optionalText, money, listQueryShape, dateOnly, time, objectId, csvEnum } = require('../../utils/validation');
const { values } = require('../../config/shared');

const hallFields = {
  name: requiredText('Hall name', 80),
  description: optionalText(2000),
  capacity: z.coerce.number({ error: 'Capacity must be a number' }).int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(100000),
  basePrice: money('Base price'),
  hourlyPrice: money('Hourly price').optional(),
  facilities: z.array(z.enum(values.hallFacilities)).max(values.hallFacilities.length).default([]),
  status: z.enum(values.hallStatuses).default('active'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour').optional(),
};

const createBody = z.object(hallFields);

const updateBody = z.object({
  ...hallFields,
  facilities: hallFields.facilities.removeDefault().optional(),
  status: hallFields.status.removeDefault().optional(),
}).partial();

const listQuery = z.object({
  ...listQueryShape,
  limit: listQueryShape.limit.default(50),
  status: csvEnum(values.hallStatuses).optional(),
});

const availabilityQuery = z.object({
  date: dateOnly('Date'),
  startTime: time('Start time'),
  endTime: time('End time'),
  excludeBooking: objectId().optional(),
});

const imageQuery = z.object({ key: z.string().min(1).max(120) });

module.exports = { createBody, updateBody, listQuery, availabilityQuery, imageQuery };
