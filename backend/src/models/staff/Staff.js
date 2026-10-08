const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

const staffSchema = new Schema(
  {
    employeeCode: { type: String, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 30 },
    cnic: { type: String, trim: true, maxlength: 20 },
    position: { type: String, enum: values.staffPositions, required: true },
    salary: moneyField(),
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: values.staffStatuses, default: 'active' },
    address: { type: String, trim: true, maxlength: 300 },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

staffSchema.plugin(tenantPlugin);
staffSchema.index({ organizationId: 1, employeeCode: 1 }, { unique: true });
staffSchema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = model('Staff', staffSchema);
