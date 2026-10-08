const { Schema } = require('mongoose');
const { moneyField } = require('../plugins/commonSchemas');

// BookingService — an extra service sold with the event (stage decor, photography, fireworks, valet…).
// Embedded in Booking: owned by one booking, always read with it.
const bookingServiceSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 300 },
  quantity: { type: Number, required: true, min: 0, default: 1 },
  unitPrice: moneyField({ required: true }),
  total: moneyField({ required: true }),
});

module.exports = bookingServiceSchema;
