const {
  z,
  objectId,
  positiveMoney,
  optionalText,
  requiredText,
  optionalDateOnly,
  listQueryShape,
  csvEnum,
  booleanish,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const receiveBody = z.object({
  booking: objectId('Choose a booking'),
  amount: positiveMoney('Amount'),
  method: z.enum(values.paymentMethods),
  type: z.enum(['advance', 'installment', 'final']).optional(),
  paidOn: optionalDateOnly('Payment date'),
  reference: optionalText(100),
  notes: optionalText(1000),
});

const refundBody = z.object({
  booking: objectId('Choose a booking'),
  amount: positiveMoney('Refund amount'),
  method: z.enum(values.paymentMethods),
  paidOn: optionalDateOnly('Refund date'),
  reference: optionalText(100),
  notes: requiredText('Reason for the refund', 1000),
});

const voidBody = z.object({ reason: requiredText('Reason', 500) });

const listQuery = z.object({
  ...listQueryShape,
  booking: objectId().optional(),
  customer: objectId().optional(),
  method: csvEnum(values.paymentMethods).optional(),
  type: csvEnum(values.paymentTypes).optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
  includeVoided: booleanish().optional(),
});

module.exports = { receiveBody, refundBody, voidBody, listQuery };
