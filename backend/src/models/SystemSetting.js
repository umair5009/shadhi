const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Operational rules. One document per organization.
const systemSettingSchema = new Schema(
  {
    timezone: { type: String, default: 'Asia/Karachi' },
    dateFormat: { type: String, enum: ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'], default: 'dd MMM yyyy' },
    booking: {
      // Minimum gap between two events in the same hall (setup / cleaning time).
      bufferMinutes: { type: Number, min: 0, max: 480, default: 60 },
      defaultStartTime: { type: String, match: TIME, default: '19:00' },
      defaultEndTime: { type: String, match: TIME, default: '23:00' },
      // Mark confirmed events as completed automatically once they are over.
      autoCompleteEvents: { type: Boolean, default: true },
    },
    payments: {
      allowOverpayment: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

systemSettingSchema.plugin(tenantPlugin);
systemSettingSchema.index({ organizationId: 1 }, { unique: true });

module.exports = model('SystemSetting', systemSettingSchema);
