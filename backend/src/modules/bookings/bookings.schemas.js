const {
  z,
  objectId,
  requiredText,
  optionalText,
  money,
  positiveMoney,
  quantity,
  dateOnly,
  optionalDateOnly,
  time,
  listQueryShape,
  csvEnum,
  booleanish,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const menuLine = z.object({
  menuItem: objectId('Choose a dish'),
  quantity: quantity().optional(),
  unitPrice: money('Price').optional(),
});

const menuInput = z
  .object({
    mode: z.enum(values.bookingMenuModes),
    package: objectId('Choose a package').optional(),
    rate: money('Package price').optional(),
    extras: z.array(menuLine).max(50).optional(),
    items: z.array(menuLine).max(100).optional(),
    notes: optionalText(1000),
  })
  .superRefine((menu, issue) => {
    if (menu.mode === 'package' && !menu.package) issue.addIssue({ code: 'custom', path: ['package'], message: 'Choose a package' });
    if (menu.mode === 'custom' && !menu.items?.length) issue.addIssue({ code: 'custom', path: ['items'], message: 'Add at least one dish' });
  });

const serviceLine = z.object({
  name: requiredText('Service name', 120),
  description: optionalText(300),
  quantity: quantity().default(1),
  unitPrice: money('Price'),
});

const chargesInput = z.object({
  hall: money('Hall charges').optional(),
  decoration: money('Decoration charges').optional(),
  other: money('Other charges').optional(),
  discount: money('Discount').optional(),
  taxRate: z.coerce.number({ error: 'Tax rate must be a number' }).min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100%').optional(),
});

const guestCount = z.coerce
  .number({ error: 'Guest count must be a number' })
  .int('Guest count must be a whole number')
  .min(1, 'At least 1 guest')
  .max(100000, 'Guest count is too large');

// Every field optional: used as-is for edits, and extended with required fields for creation.
const editableFields = {
  customer: objectId('Choose a customer'),
  hall: objectId('Choose a hall'),
  eventType: z.enum(values.eventTypes),
  title: optionalText(160),
  eventDate: dateOnly('Event date'),
  startTime: time('Start time'),
  endTime: time('End time'),
  guestCount,
  menu: menuInput,
  services: z.array(serviceLine).max(50),
  charges: chargesInput,
  notes: optionalText(3000),
};

const updateBody = z.object(editableFields).partial();

const advancePayment = z.object({
  amount: positiveMoney('Advance amount'),
  method: z.enum(values.paymentMethods),
  reference: optionalText(100),
  paidOn: optionalDateOnly('Payment date'),
});

const createBody = z.object({
  ...editableFields,
  title: editableFields.title,
  menu: menuInput.optional(),
  services: editableFields.services.optional(),
  charges: chargesInput.optional(),
  status: z.enum(['inquiry', 'tentative', 'confirmed', 'completed']).default('tentative'),
  advancePayment: advancePayment.optional(),
});

const statusBody = z
  .object({
    status: z.enum(values.bookingStatuses),
    note: optionalText(500),
    reason: optionalText(500),
  })
  .superRefine((body, issue) => {
    if (body.status === 'cancelled' && !body.reason) issue.addIssue({ code: 'custom', path: ['reason'], message: 'Please give a reason for cancelling' });
  });

const listQuery = z.object({
  ...listQueryShape,
  customer: objectId().optional(),
  hall: objectId().optional(),
  eventType: csvEnum(values.eventTypes).optional(),
  status: csvEnum(values.bookingStatuses).optional(),
  paymentStatus: csvEnum(values.paymentStatuses).optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
  hasBalance: booleanish().optional(),
  upcoming: booleanish().optional(),
});

const calendarQuery = z
  .object({
    from: dateOnly('From date'),
    to: dateOnly('To date'),
    hall: objectId().optional(),
    includeCancelled: booleanish().optional(),
  })
  .refine((query) => query.to >= query.from, { message: 'The end date must be after the start date', path: ['to'] })
  .refine((query) => query.to - query.from <= 62 * 24 * 60 * 60 * 1000, { message: 'Choose a range of at most 62 days', path: ['to'] });

const availabilityBody = z.object({
  hall: objectId('Choose a hall'),
  eventDate: dateOnly('Event date'),
  startTime: time('Start time'),
  endTime: time('End time'),
  excludeBooking: objectId().optional(),
});

module.exports = { createBody, updateBody, statusBody, listQuery, calendarQuery, availabilityBody };
