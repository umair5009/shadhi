const { z } = require('zod');
const { Types } = require('mongoose');
const { isDateOnlyString, toDateOnly } = require('./dates');
const { roundMoney } = require('../config/shared');
const { listQueryShape } = require('./listQuery');

// Plain-language messages: these reach front-desk staff, not developers.
z.config({
  customError: (issue) => {
    if (issue.code === 'invalid_type' && (issue.input === undefined || issue.input === null)) return 'This field is required';
    if (issue.code === 'invalid_type' && issue.expected === 'number') return 'Enter a number';
    if (issue.code === 'invalid_value') return 'Choose one of the available options';
    if (issue.code === 'unrecognized_keys') return 'Unexpected field';
    return undefined;
  },
});

const OBJECT_ID = /^[a-f\d]{24}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nullToEmpty = (value) => (value === null ? '' : value);
const blankToNull = (value) => (value === '' ? null : value);

// Parsed into a real ObjectId: aggregation pipelines don't cast strings the way find() does.
const objectId = (message = 'Choose a valid option') =>
  z
    .string({ error: message })
    .regex(OBJECT_ID, message)
    .transform((value) => new Types.ObjectId(value));

/** Optional reference: omitted = unchanged, '' or null = clear. */
const optionalObjectId = () => z.preprocess(blankToNull, objectId().nullable().optional());

const requiredText = (label, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long (max ${max} characters)`);

/** Optional text: omitted = unchanged, '' or null = clear. */
const optionalText = (max = 500) => z.preprocess(nullToEmpty, z.string().trim().max(max, `Too long (max ${max} characters)`).optional());

const money = (label = 'Amount') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(10_000_000_000, `${label} is too large`)
    .transform(roundMoney);

const positiveMoney = (label = 'Amount') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .gt(0, `${label} must be more than zero`)
    .max(10_000_000_000, `${label} is too large`)
    .transform(roundMoney);

const quantity = (label = 'Quantity') => z.coerce.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1_000_000);

const dateOnly = (label = 'Date') =>
  z.string({ error: `${label} is required` }).refine(isDateOnlyString, `${label} must be a valid date`).transform(toDateOnly);

const optionalDateOnly = (label = 'Date') => z.preprocess(blankToNull, dateOnly(label).nullable().optional());

const time = (label = 'Time') => z.string({ error: `${label} is required` }).regex(TIME, `${label} must look like 19:30`);

const optionalTime = (label = 'Time') => z.preprocess(nullToEmpty, z.union([z.literal(''), time(label)]).optional());

const phone = (label = 'Phone') =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .regex(/^\+?[\d\s\-()]{7,20}$/, `${label} must be a valid phone number`);

const optionalPhone = (label = 'Phone') => z.preprocess(nullToEmpty, z.union([z.literal(''), phone(label)]).optional());

const optionalEmail = () =>
  z.preprocess(
    nullToEmpty,
    z.string().trim().toLowerCase().max(254).refine((value) => value === '' || EMAIL.test(value), 'Enter a valid email address').optional(),
  );

const email = () => z.string({ error: 'Email is required' }).trim().toLowerCase().max(254).regex(EMAIL, 'Enter a valid email address');

const password = () =>
  z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number');

const booleanish = () => z.preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean());

const idParams = z.object({ id: objectId('Invalid id') });

/** Comma separated list in a query string → array of allowed values. */
const csvEnum = (allowed) =>
  z
    .string()
    .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
    .pipe(z.array(z.enum(allowed)));

module.exports = {
  z,
  objectId,
  optionalObjectId,
  requiredText,
  optionalText,
  money,
  positiveMoney,
  quantity,
  dateOnly,
  optionalDateOnly,
  time,
  optionalTime,
  phone,
  optionalPhone,
  email,
  optionalEmail,
  password,
  booleanish,
  idParams,
  csvEnum,
  listQueryShape,
};
