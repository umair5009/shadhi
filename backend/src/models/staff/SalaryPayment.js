const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const immutablePlugin = require('../plugins/immutable');
const { voidSchema, moneyField } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

// Salary paid to an employee for a month. Every salary payment posts a matching Salary expense.
const salaryPaymentSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    grossAmount: moneyField(),
    bonus: moneyField(),
    deductions: moneyField(),
    netAmount: { type: Number, required: true, min: 0.01 },
    paidOn: { type: Date, required: true },
    method: { type: String, enum: values.paymentMethods, default: 'cash' },
    reference: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 500 },
    expense: { type: Schema.Types.ObjectId, ref: 'Expense' },
    void: { type: voidSchema },
  },
  { timestamps: true },
);

salaryPaymentSchema.plugin(tenantPlugin);
salaryPaymentSchema.plugin(immutablePlugin, { allowedPaths: ['void', 'expense'], label: 'A salary payment' });
salaryPaymentSchema.index({ organizationId: 1, period: 1, staff: 1 });
salaryPaymentSchema.index({ organizationId: 1, staff: 1, paidOn: -1 });

module.exports = model('SalaryPayment', salaryPaymentSchema);
