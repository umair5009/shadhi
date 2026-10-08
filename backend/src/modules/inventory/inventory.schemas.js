const {
  z,
  objectId,
  optionalObjectId,
  requiredText,
  optionalText,
  optionalPhone,
  optionalEmail,
  money,
  quantity,
  optionalDateOnly,
  listQueryShape,
  csvEnum,
  booleanish,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

// ─── Suppliers ───────────────────────────────────────────────
const supplierFields = {
  name: requiredText('Supplier name', 120),
  contactPerson: optionalText(100),
  phone: optionalPhone(),
  email: optionalEmail(),
  address: optionalText(300),
  notes: optionalText(1000),
};
const supplierBody = z.object({ ...supplierFields, isActive: z.boolean().default(true) });
const supplierUpdateBody = z.object({ ...supplierFields, name: supplierFields.name.optional(), isActive: z.boolean().optional() });
const supplierListQuery = z.object({ ...listQueryShape, limit: listQueryShape.limit.default(50), isActive: booleanish().optional() });

// ─── Items ───────────────────────────────────────────────────
const itemFields = {
  name: requiredText('Item name', 100),
  kind: z.enum(values.inventoryKinds),
  category: requiredText('Category', 60),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,40}$/, 'SKU can use letters, numbers and dashes (2–40 characters)'),
  unit: z.enum(values.inventoryUnits),
  minimumQuantity: quantity('Minimum quantity').default(0),
  costPerUnit: money('Cost per unit').default(0),
  supplier: optionalObjectId(),
  location: optionalText(100),
  notes: optionalText(1000),
};
const itemBody = z.object({
  ...itemFields,
  // Stock already on hand when the item is added; recorded as an opening stock movement.
  openingQuantity: quantity('Opening quantity').default(0),
});
const itemUpdateBody = z.object({
  name: itemFields.name.optional(),
  kind: itemFields.kind.optional(),
  category: itemFields.category.optional(),
  sku: itemFields.sku.optional(),
  unit: itemFields.unit.optional(),
  minimumQuantity: quantity('Minimum quantity').optional(),
  costPerUnit: money('Cost per unit').optional(),
  supplier: itemFields.supplier,
  location: itemFields.location,
  notes: itemFields.notes,
  isActive: z.boolean().optional(),
});
const itemListQuery = z.object({
  ...listQueryShape,
  limit: listQueryShape.limit.default(50),
  kind: csvEnum(values.inventoryKinds).optional(),
  category: z.string().trim().max(60).optional(),
  stockStatus: csvEnum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  supplier: objectId().optional(),
  isActive: booleanish().optional(),
});

// ─── Transactions ────────────────────────────────────────────
const transactionBody = z
  .object({
    item: objectId('Choose an item'),
    type: z.enum(values.inventoryTransactionTypes),
    // For adjustments this is the counted quantity on hand; for everything else, how much moved.
    quantity: quantity('Quantity'),
    unitCost: money('Unit cost').optional(),
    supplier: optionalObjectId(),
    booking: optionalObjectId(),
    date: optionalDateOnly('Date'),
    reference: optionalText(100),
    notes: optionalText(500),
    recordExpense: z.boolean().default(true),
    paymentMethod: z.enum(values.paymentMethods).default('cash'),
  })
  .superRefine((body, issue) => {
    if (body.type !== 'adjustment' && body.quantity <= 0) issue.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be more than zero' });
  });

const transactionListQuery = z.object({
  ...listQueryShape,
  item: objectId().optional(),
  type: csvEnum(values.inventoryTransactionTypes).optional(),
  booking: objectId().optional(),
  supplier: objectId().optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
});

module.exports = {
  supplierBody,
  supplierUpdateBody,
  supplierListQuery,
  itemBody,
  itemUpdateBody,
  itemListQuery,
  transactionBody,
  transactionListQuery,
};
