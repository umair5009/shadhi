const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const immutablePlugin = require('../plugins/immutable');
const { voidSchema } = require('../plugins/commonSchemas');

// An invoice is a frozen copy of the booking's money at the time it was issued, so reprinting it later always
// shows exactly what the customer was given. If the booking changes, a new invoice supersedes this one.
const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date },
    status: { type: String, enum: ['issued', 'void'], default: 'issued' },
    notes: { type: String, trim: true, maxlength: 1000 },
    snapshot: {
      business: { type: Schema.Types.Mixed, required: true },
      customer: { type: Schema.Types.Mixed, required: true },
      event: { type: Schema.Types.Mixed, required: true },
      menu: { type: Schema.Types.Mixed },
      services: { type: [Schema.Types.Mixed], default: [] },
      // Priced lines exactly as printed: [{ description, detail, quantity, rate, amount }]
      lines: { type: [Schema.Types.Mixed], default: [] },
      charges: { type: Schema.Types.Mixed, required: true },
      totals: { type: Schema.Types.Mixed, required: true },
      currency: { type: Schema.Types.Mixed, required: true },
      terms: { type: String },
      footer: { type: String },
    },
    void: { type: voidSchema },
    supersededBy: { type: Schema.Types.ObjectId, ref: 'Invoice' },
  },
  { timestamps: true },
);

invoiceSchema.plugin(tenantPlugin);
invoiceSchema.plugin(immutablePlugin, { allowedPaths: ['status', 'void', 'supersededBy'], label: 'An invoice' });
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, booking: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, issueDate: -1 });

module.exports = model('Invoice', invoiceSchema);
