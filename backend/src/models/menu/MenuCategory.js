const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');

const menuCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

menuCategorySchema.plugin(tenantPlugin);
menuCategorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('MenuCategory', menuCategorySchema);
