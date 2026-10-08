const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');

const expenseCategorySchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9_]+$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    // Built-in categories (salary, inventory purchase…) are used by automatic postings and cannot be removed.
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

expenseCategorySchema.plugin(tenantPlugin);
expenseCategorySchema.index({ organizationId: 1, key: 1 }, { unique: true });
expenseCategorySchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('ExpenseCategory', expenseCategorySchema);
