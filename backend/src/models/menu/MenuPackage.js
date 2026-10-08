const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

const packageItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    // Optional dishes are offered with the package but only charged (extraPrice) when the customer picks them.
    isOptional: { type: Boolean, default: false },
    extraPrice: moneyField(),
  },
  { _id: false },
);

const menuPackageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000 },
    pricingType: { type: String, enum: values.packagePricingTypes, default: 'per_person' },
    price: moneyField({ required: true }),
    minGuests: { type: Number, min: 0, default: 0 },
    items: { type: [packageItemSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

menuPackageSchema.plugin(tenantPlugin);
menuPackageSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('MenuPackage', menuPackageSchema);
