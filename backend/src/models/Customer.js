const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');

/** Keeps only digits and normalises Pakistani mobile formats so 0300-1234567 and +92 300 1234567 match. */
function phoneDigits(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('0092') && digits.length === 14) return `0${digits.slice(4)}`;
  return digits;
}

const customerSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    phoneDigits: { type: String, required: true },
    alternatePhone: { type: String, trim: true, maxlength: 30 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    cnic: { type: String, trim: true, maxlength: 20 },
    address: { type: String, trim: true, maxlength: 300 },
    city: { type: String, trim: true, maxlength: 80 },
    notes: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

customerSchema.plugin(tenantPlugin);
customerSchema.index({ organizationId: 1, phoneDigits: 1 }, { unique: true });
customerSchema.index({ organizationId: 1, fullName: 1 });
customerSchema.index({ organizationId: 1, createdAt: -1 });

customerSchema.pre('validate', function setPhoneDigits() {
  if (this.isModified('phone') || !this.phoneDigits) this.phoneDigits = phoneDigits(this.phone);
});

const Customer = model('Customer', customerSchema);
Customer.phoneDigits = phoneDigits;

module.exports = Customer;
