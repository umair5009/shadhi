const { Schema, model } = require('mongoose');
const tenantPlugin = require('../plugins/tenant');
const { values } = require('../../config/shared');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const attendanceSchema = new Schema(
  {
    staff: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: values.attendanceStatuses, required: true },
    checkIn: { type: String, match: TIME },
    checkOut: { type: String, match: TIME },
    notes: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true },
);

attendanceSchema.plugin(tenantPlugin);
attendanceSchema.index({ organizationId: 1, staff: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organizationId: 1, date: 1 });

module.exports = model('Attendance', attendanceSchema);
