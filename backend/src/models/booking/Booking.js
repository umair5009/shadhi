const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { moneyField } = require('../plugins/commonSchemas');
const bookingServiceSchema = require('./bookingService.schema');
const { bookingMenuSchema } = require('./bookingMenu.schema');
const { values } = require('../../config/shared');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Inputs typed by staff.
const chargesSchema = new Schema(
  {
    hall: moneyField(),
    decoration: moneyField(),
    other: moneyField(),
    discount: moneyField(),
    taxRate: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false },
);

// Computed by shared/bookingFinance.js — never written from request input.
const totalsSchema = new Schema(
  {
    hall: moneyField(),
    menu: moneyField(),
    decoration: moneyField(),
    services: moneyField(),
    other: moneyField(),
    subtotal: moneyField(),
    discount: moneyField(),
    taxable: moneyField(),
    tax: moneyField(),
    grandTotal: moneyField(),
    paid: moneyField(),
    refunded: moneyField(),
    netPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { _id: false },
);

const statusChangeSchema = new Schema(
  {
    from: { type: String, enum: values.bookingStatuses },
    to: { type: String, enum: values.bookingStatuses, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    bookingNumber: { type: String, required: true, immutable: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    hall: { type: Schema.Types.ObjectId, ref: 'Hall', required: true },
    eventType: { type: String, enum: values.eventTypes, required: true },
    title: { type: String, trim: true, maxlength: 160 },
    eventDate: { type: Date, required: true },
    startTime: { type: String, required: true, match: TIME },
    endTime: { type: String, required: true, match: TIME },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    guestCount: { type: Number, required: true, min: 1, max: 100000 },

    menu: { type: bookingMenuSchema, default: () => ({ mode: 'none' }) },
    services: { type: [bookingServiceSchema], default: [] },
    charges: { type: chargesSchema, default: () => ({}) },
    totals: { type: totalsSchema, default: () => ({}) },
    paymentStatus: { type: String, enum: values.paymentStatuses, default: 'unpaid' },

    status: { type: String, enum: values.bookingStatuses, default: 'inquiry' },
    statusHistory: { type: [statusChangeSchema], default: [] },
    cancellation: {
      reason: { type: String, trim: true, maxlength: 500 },
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    notes: { type: String, trim: true, maxlength: 3000 },
    // Short-lived mutex for money changes (see modules/bookings/bookingLock.js). Never returned by queries.
    lock: {
      type: new Schema({ token: Schema.Types.ObjectId, until: Date }, { _id: false }),
      select: false,
    },
  },
  { timestamps: true },
);

bookingSchema.plugin(tenantPlugin);
bookingSchema.index({ organizationId: 1, bookingNumber: 1 }, { unique: true });
bookingSchema.index({ organizationId: 1, hall: 1, startAt: 1, endAt: 1 });
bookingSchema.index({ organizationId: 1, eventDate: 1 });
bookingSchema.index({ organizationId: 1, customer: 1, eventDate: -1 });
bookingSchema.index({ organizationId: 1, status: 1, eventDate: 1 });
bookingSchema.index({ organizationId: 1, paymentStatus: 1 });

bookingSchema.pre('validate', function checkWindow() {
  if (this.startAt && this.endAt && this.endAt <= this.startAt) {
    this.invalidate('endTime', 'End time must be after the start time');
  }
});

module.exports = model('Booking', bookingSchema);
