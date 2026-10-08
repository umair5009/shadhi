const { Schema, model } = require('mongoose');

// A signed-in device. Holds the hashed refresh token; revoking the session signs that device out.
const sessionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    // Previous token, accepted for a few seconds after rotation (see REFRESH_GRACE_MS).
    previousTokenHash: { type: String, index: true, sparse: true },
    rotatedAt: { type: Date },
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 60 },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

// MongoDB removes sessions automatically once they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('Session', sessionSchema);
