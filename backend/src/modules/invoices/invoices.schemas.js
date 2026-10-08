const { z, objectId, optionalText, requiredText, optionalDateOnly, listQueryShape, csvEnum } = require('../../utils/validation');
const { values } = require('../../config/shared');

const createBody = z.object({
  booking: objectId('Choose a booking'),
  dueDate: optionalDateOnly('Due date'),
  notes: optionalText(1000),
  // true = void the booking's current invoice and issue a new one
  replace: z.boolean().default(false),
});

const voidBody = z.object({ reason: requiredText('Reason', 500) });

const listQuery = z.object({
  ...listQueryShape,
  booking: objectId().optional(),
  customer: objectId().optional(),
  status: csvEnum(['issued', 'void']).optional(),
  paymentStatus: csvEnum(values.paymentStatuses).optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
});

module.exports = { createBody, voidBody, listQuery };
