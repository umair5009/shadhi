const { Schema, model } = require('mongoose');

// Atomic sequence per organization + key (e.g. "invoice:2026"). See utils/numbering.js.
const counterSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  key: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

counterSchema.index({ organizationId: 1, key: 1 }, { unique: true });

module.exports = model('Counter', counterSchema);
