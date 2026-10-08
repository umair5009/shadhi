const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { fileSchema, moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

const menuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
    description: { type: String, trim: true, maxlength: 500 },
    image: { type: fileSchema },
    price: moneyField({ required: true }),
    unit: { type: String, enum: values.menuUnits, default: 'per_person' },
    isAvailable: { type: Boolean, default: true },
    ingredients: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
);

menuItemSchema.plugin(tenantPlugin);
menuItemSchema.index({ organizationId: 1, name: 1 }, { unique: true });
menuItemSchema.index({ organizationId: 1, category: 1 });

module.exports = model('MenuItem', menuItemSchema);
