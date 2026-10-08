const { Schema } = require('mongoose');
const { moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

// BookingPackage — snapshot of the package chosen for this booking. The rate is what the customer agreed to pay,
// which may differ from today's package price.
const bookingPackageSchema = new Schema(
  {
    ref: { type: Schema.Types.ObjectId, ref: 'MenuPackage' },
    name: { type: String, required: true, trim: true },
    pricingType: { type: String, enum: values.packagePricingTypes, required: true },
    rate: moneyField({ required: true }),
  },
  { _id: false },
);

// A dish on the booking's menu.
//   source 'package' → included in the package (no separate price)
//   source 'extra'   → optional/extra dish added on top of the package
//   source 'custom'  → line of a custom (non-package) menu
const bookingMenuItemSchema = new Schema({
  menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem' },
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  source: { type: String, enum: ['package', 'extra', 'custom'], required: true },
  unit: { type: String, enum: values.menuUnits },
  quantity: { type: Number, min: 0, default: 0 },
  unitPrice: moneyField(),
  total: moneyField(),
});

// BookingMenu — everything about the food for this booking.
const bookingMenuSchema = new Schema(
  {
    mode: { type: String, enum: values.bookingMenuModes, default: 'none' },
    package: { type: bookingPackageSchema },
    items: { type: [bookingMenuItemSchema], default: [] },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: false },
);

module.exports = { bookingMenuSchema, bookingPackageSchema, bookingMenuItemSchema };
