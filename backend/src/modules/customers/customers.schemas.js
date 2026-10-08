const {
  z,
  requiredText,
  optionalText,
  phone,
  optionalPhone,
  optionalEmail,
  listQueryShape,
  optionalDateOnly,
  csvEnum,
  booleanish,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const customerFields = {
  fullName: requiredText('Full name', 120),
  phone: phone('Phone'),
  alternatePhone: optionalPhone('Alternate phone'),
  email: optionalEmail(),
  cnic: z.preprocess(
    (value) => (value === null ? '' : value),
    z.string().trim().regex(/^(\d{5}-?\d{7}-?\d)?$/, 'CNIC should look like 35202-1234567-1').optional(),
  ),
  address: optionalText(300),
  city: optionalText(80),
  notes: optionalText(2000),
};

const createBody = z.object(customerFields);
const updateBody = z.object(customerFields).partial();

const listQuery = z.object({
  ...listQueryShape,
  city: z.string().trim().max(80).optional(),
  eventType: csvEnum(values.eventTypes).optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
  hasBalance: booleanish().optional(),
});

const lookupQuery = z.object({ q: z.string().trim().min(1).max(60) });

module.exports = { createBody, updateBody, listQuery, lookupQuery };
