const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');
const { ALL_PERMISSIONS } = require('../config/permissions');

const roleSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9_]+$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    permissions: {
      type: [{ type: String, enum: ALL_PERMISSIONS }],
      default: [],
    },
    // Built-in roles cannot be deleted (their permissions are still editable, except Super Admin).
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

roleSchema.plugin(tenantPlugin);
roleSchema.index({ organizationId: 1, key: 1 }, { unique: true });
roleSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = model('Role', roleSchema);
