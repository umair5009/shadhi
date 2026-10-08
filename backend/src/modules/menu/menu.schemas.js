const {
  z,
  objectId,
  requiredText,
  optionalText,
  money,
  listQueryShape,
  booleanish,
  optionalDateOnly,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const categoryBody = z.object({
  name: requiredText('Category name', 60),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
const categoryUpdateBody = z.object({
  name: requiredText('Category name', 60).optional(),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

const ingredients = z.array(z.string().trim().min(1).max(60)).max(40);

const itemBody = z.object({
  name: requiredText('Dish name', 100),
  category: objectId('Choose a category'),
  description: optionalText(500),
  price: money('Price'),
  unit: z.enum(values.menuUnits).default('per_person'),
  isAvailable: z.boolean().default(true),
  ingredients: ingredients.default([]),
  notes: optionalText(500),
});
const itemUpdateBody = z.object({
  name: requiredText('Dish name', 100).optional(),
  category: objectId('Choose a category').optional(),
  description: optionalText(500),
  price: money('Price').optional(),
  unit: z.enum(values.menuUnits).optional(),
  isAvailable: z.boolean().optional(),
  ingredients: ingredients.optional(),
  notes: optionalText(500),
});

const itemListQuery = z.object({
  ...listQueryShape,
  limit: listQueryShape.limit.default(50),
  category: objectId().optional(),
  isAvailable: booleanish().optional(),
});

const packageItem = z.object({
  menuItem: objectId('Choose a dish'),
  isOptional: z.boolean().default(false),
  extraPrice: money('Extra price').default(0),
});

const packageItems = z
  .array(packageItem)
  .max(60)
  .refine((items) => new Set(items.map((item) => String(item.menuItem))).size === items.length, 'The same dish is listed twice');

const packageBody = z.object({
  name: requiredText('Package name', 80),
  description: optionalText(1000),
  pricingType: z.enum(values.packagePricingTypes).default('per_person'),
  price: money('Package price'),
  minGuests: z.coerce.number().int().min(0).max(100000).default(0),
  items: packageItems.default([]),
  isActive: z.boolean().default(true),
});
const packageUpdateBody = z.object({
  name: requiredText('Package name', 80).optional(),
  description: optionalText(1000),
  pricingType: z.enum(values.packagePricingTypes).optional(),
  price: money('Package price').optional(),
  minGuests: z.coerce.number().int().min(0).max(100000).optional(),
  items: packageItems.optional(),
  isActive: z.boolean().optional(),
});

const packageListQuery = z.object({ includeInactive: booleanish().optional() });

const usageQuery = z.object({
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
});

module.exports = {
  categoryBody,
  categoryUpdateBody,
  itemBody,
  itemUpdateBody,
  itemListQuery,
  packageBody,
  packageUpdateBody,
  packageListQuery,
  usageQuery,
};
