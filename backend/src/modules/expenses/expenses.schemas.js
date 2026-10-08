const {
  z,
  objectId,
  optionalObjectId,
  requiredText,
  optionalText,
  positiveMoney,
  money,
  dateOnly,
  optionalDateOnly,
  listQueryShape,
  csvEnum,
  booleanish,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const expenseFields = {
  category: objectId('Choose a category'),
  amount: positiveMoney('Amount'),
  date: dateOnly('Date'),
  description: requiredText('Description', 500),
  vendor: optionalText(120),
  supplier: optionalObjectId(),
  paymentMethod: z.enum(values.paymentMethods).default('cash'),
  reference: optionalText(100),
  booking: optionalObjectId(),
  staff: optionalObjectId(),
};

const createBody = z.object(expenseFields);

const updateBody = z.object({
  category: expenseFields.category.optional(),
  amount: expenseFields.amount.optional(),
  date: expenseFields.date.optional(),
  description: requiredText('Description', 500).optional(),
  vendor: expenseFields.vendor,
  supplier: expenseFields.supplier,
  paymentMethod: z.enum(values.paymentMethods).optional(),
  reference: expenseFields.reference,
  booking: expenseFields.booking,
  staff: expenseFields.staff,
});

const voidBody = z.object({ reason: requiredText('Reason', 500) });

const objectIdList = z
  .string()
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
  .pipe(z.array(objectId()));

const listQuery = z.object({
  ...listQueryShape,
  category: objectIdList.optional(),
  booking: objectId().optional(),
  staff: objectId().optional(),
  supplier: objectId().optional(),
  source: csvEnum(values.expenseSources).optional(),
  paymentMethod: csvEnum(values.paymentMethods).optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
  minAmount: money('Minimum amount').optional(),
  maxAmount: money('Maximum amount').optional(),
  eventLinked: booleanish().optional(),
  includeVoided: booleanish().optional(),
});

const categoryBody = z.object({
  name: requiredText('Category name', 60),
  description: optionalText(300),
});

const categoryUpdateBody = z.object({
  name: requiredText('Category name', 60).optional(),
  description: optionalText(300),
  isActive: z.boolean().optional(),
});

module.exports = { createBody, updateBody, voidBody, listQuery, categoryBody, categoryUpdateBody };
