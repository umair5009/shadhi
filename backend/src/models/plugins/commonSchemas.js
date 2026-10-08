const { Schema } = require('mongoose');

/** One-time void stamp for financial records. A voided record stays in the database but no longer counts. */
const voidSchema = new Schema(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
  },
  { _id: false },
);

/** Reference to an uploaded file (see services/storage.js). */
const fileSchema = new Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    name: { type: String, trim: true },
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: false },
);

const moneyField = (extra = {}) => ({ type: Number, min: 0, default: 0, ...extra });

module.exports = { voidSchema, fileSchema, moneyField };
