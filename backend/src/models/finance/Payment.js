const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const immutablePlugin = require('../plugins/immutable');
const { voidSchema } = require('../plugins/commonSchemas');
const { values } = require('../../config/shared');

// A money movement against a booking. Immutable once written; mistakes are voided, returns are refunds.
const paymentSchema = new Schema(
  {
    receiptNumber: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: values.paymentTypes, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: values.paymentMethods, required: true },
    paidOn: { type: Date, required: true },
    reference: { type: String, trim: true, maxlength: 100 },
    notes: { type: String, trim: true, maxlength: 1000 },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    void: { type: voidSchema },
  },
  { timestamps: true },
);

paymentSchema.plugin(tenantPlugin);
paymentSchema.plugin(immutablePlugin, { allowedPaths: ['void'], label: 'A payment' });
paymentSchema.index({ organizationId: 1, receiptNumber: 1 }, { unique: true });
paymentSchema.index({ organizationId: 1, booking: 1, paidOn: 1 });
paymentSchema.index({ organizationId: 1, paidOn: -1 });
paymentSchema.index({ organizationId: 1, customer: 1 });
paymentSchema.index({ organizationId: 1, method: 1 });

module.exports = model('Payment', paymentSchema);
