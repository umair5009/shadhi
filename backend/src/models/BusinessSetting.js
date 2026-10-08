const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');
const { fileSchema } = require('./plugins/commonSchemas');

// Business profile printed on invoices and receipts. One document per organization.
const businessSettingSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 160 },
    logo: { type: fileSchema },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 40 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    website: { type: String, trim: true, maxlength: 200 },
    tax: {
      ntn: { type: String, trim: true, maxlength: 40 },
      strn: { type: String, trim: true, maxlength: 40 },
      label: { type: String, trim: true, default: 'Sales Tax', maxlength: 40 },
      defaultRate: { type: Number, min: 0, max: 100, default: 0 },
    },
    currency: {
      code: { type: String, trim: true, uppercase: true, default: 'PKR', maxlength: 3 },
      symbol: { type: String, trim: true, default: 'Rs.', maxlength: 8 },
      locale: { type: String, trim: true, default: 'en-PK', maxlength: 20 },
      decimals: { type: Number, min: 0, max: 2, default: 0 },
    },
    invoice: {
      prefix: { type: String, trim: true, uppercase: true, default: 'INV', maxlength: 10 },
      receiptPrefix: { type: String, trim: true, uppercase: true, default: 'RCP', maxlength: 10 },
      startingNumber: { type: Number, min: 1, default: 1 },
      dueDays: { type: Number, min: 0, max: 365, default: 7 },
      footer: { type: String, trim: true, maxlength: 500, default: 'Thank you for choosing us for your special day.' },
      terms: { type: String, trim: true, maxlength: 3000 },
    },
  },
  { timestamps: true },
);

businessSettingSchema.plugin(tenantPlugin);
businessSettingSchema.index({ organizationId: 1 }, { unique: true });

module.exports = model('BusinessSetting', businessSettingSchema);
