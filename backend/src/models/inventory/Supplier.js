const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');

const supplierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactPerson: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 1000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.plugin(tenantPlugin);
supplierSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('Supplier', supplierSchema);
