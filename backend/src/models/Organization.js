const { Schema, model } = require('mongoose');

// The tenant. Today there is one; the SaaS version adds more and everything else is already scoped by it.
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = model('Organization', organizationSchema);
