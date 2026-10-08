const { z, requiredText, optionalText, optionalPhone, optionalEmail, time } = require('../../utils/validation');
const { isValidTimeZone } = require('../../utils/dates');

const businessBody = z.object({
  name: requiredText('Business name', 120),
  tagline: optionalText(160),
  address: optionalText(300),
  city: optionalText(80),
  phone: optionalPhone(),
  email: optionalEmail(),
  website: optionalText(200),
  tax: z
    .object({
      ntn: optionalText(40),
      strn: optionalText(40),
      label: optionalText(40),
      defaultRate: z.coerce.number().min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100%'),
    })
    .partial()
    .optional(),
  currency: z
    .object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. PKR'),
      symbol: requiredText('Currency symbol', 8),
      locale: requiredText('Number format', 20),
      decimals: z.coerce.number().int().min(0).max(2),
    })
    .partial()
    .optional(),
  invoice: z
    .object({
      prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/, 'Use up to 10 letters or numbers'),
      receiptPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,10}$/, 'Use up to 10 letters or numbers'),
      startingNumber: z.coerce.number().int().min(1, 'Starting number must be at least 1').max(99_999_999),
      dueDays: z.coerce.number().int().min(0).max(365),
      footer: optionalText(500),
      terms: optionalText(3000),
    })
    .partial()
    .optional(),
});

const systemBody = z.object({
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional(),
  dateFormat: z.enum(['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']).optional(),
  booking: z
    .object({
      bufferMinutes: z.coerce.number().int().min(0).max(480),
      defaultStartTime: time('Default start time'),
      defaultEndTime: time('Default end time'),
      autoCompleteEvents: z.boolean(),
    })
    .partial()
    .optional(),
  payments: z.object({ allowOverpayment: z.boolean() }).partial().optional(),
});

module.exports = { businessBody, systemBody };
