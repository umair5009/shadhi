const { Schema, model } = require('mongoose');
const tenantPlugin = require('./plugins/tenant');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    staff: { type: Schema.Types.ObjectId, ref: 'Staff' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.plugin(tenantPlugin);
// Email is the login identifier, so it is unique across all organizations.
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, name: 1 });
userSchema.index({ resetTokenHash: 1 }, { sparse: true });

userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpiresAt;
    return ret;
  },
});

module.exports = model('User', userSchema);
