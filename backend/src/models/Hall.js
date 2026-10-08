const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');
const { fileSchema, moneyField } = require('./plugins/commonSchemas');
const { values } = require('../config/shared');

const hallSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 2000 },
    capacity: { type: Number, required: true, min: 1, max: 100000 },
    basePrice: moneyField(),
    hourlyPrice: moneyField(),
    facilities: { type: [{ type: String, enum: values.hallFacilities }], default: [] },
    images: { type: [fileSchema], default: [] },
    status: { type: String, enum: values.hallStatuses, default: 'active' },
    // Colour used for this hall's events on the calendar.
    color: { type: String, match: /^#[0-9a-fA-F]{6}$/, default: '#7A1F3D' },
  },
  { timestamps: true },
);

hallSchema.plugin(tenantPlugin);
hallSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('Hall', hallSchema);
