const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const { User, Session, Organization } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { signAccessToken, generateOpaqueToken, hashToken } = require('../../services/tokens');
const { getBusinessSettings, getSystemSettings } = require('../../services/settings');
const { sendEmail, isEmailEnabled } = require('../../services/mailer');
const { recordAudit } = require('../../services/audit');
const { BCRYPT_ROUNDS, REFRESH_GRACE_MS } = require('./auth.constants');
const { SUPER_ADMIN_ROLE_KEY, ALL_PERMISSIONS } = require('../../config/permissions');

// Compared against when the email doesn't exist so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

async function issueSession(user, meta) {
  const refreshToken = generateOpaqueToken();
  const session = await Session.create({
    organizationId: user.organizationId,
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    userAgent: meta.userAgent?.slice(0, 400),
    ip: meta.ip,
    expiresAt: refreshExpiry(),
  });
  const accessToken = signAccessToken({ userId: user._id, organizationId: user.organizationId, sessionId: session._id });
  return { accessToken, refreshToken, session };
}

/** Everything the web app needs about the signed-in user and their business. */
async function buildProfile(userId) {
  const user = await User.findById(userId).populate('role', 'key name permissions').lean();
  const [business, system] = await Promise.all([getBusinessSettings(user.organizationId), getSystemSettings(user.organizationId)]);
  const isSuperAdmin = user.role.key === SUPER_ADMIN_ROLE_KEY;
  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      lastLoginAt: user.lastLoginAt,
      role: { _id: user.role._id, key: user.role.key, name: user.role.name },
      permissions: isSuperAdmin ? ALL_PERMISSIONS : user.role.permissions,
    },
    organization: {
      _id: user.organizationId,
      name: business.name,
      tagline: business.tagline,
      logoUrl: business.logo?.url ?? null,
      phone: business.phone,
      currency: business.currency,
      defaultTaxRate: business.tax?.defaultRate ?? 0,
      timezone: system.timezone,
      dateFormat: system.dateFormat,
      booking: system.booking,
      allowOverpayment: system.payments?.allowOverpayment ?? false,
    },
  };
}

async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordMatches) throw ApiError.unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated. Please contact your administrator.');

  const organization = await Organization.findById(user.organizationId).lean();
  if (!organization?.isActive) throw ApiError.forbidden('This business account is not active.');

  const tokens = await issueSession(user, meta);
  user.lastLoginAt = new Date();
  await user.save();
  await recordAudit(
    { organizationId: user.organizationId, userId: user._id, userName: user.name, ip: meta.ip },
    { action: 'auth.login', entity: { kind: 'user', id: user._id, label: user.name }, summary: `${user.name} signed in` },
  );
  return { ...tokens, profile: await buildProfile(user._id) };
}

/**
 * Exchanges a refresh token for a new access token and rotates the refresh token.
 * @returns {{ accessToken: string, refreshToken: string|null }} refreshToken is null inside the grace window
 */
async function refresh(refreshToken, meta) {
  if (!refreshToken) throw ApiError.unauthorized();
  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  let session = await Session.findOne({ refreshTokenHash: tokenHash, revokedAt: null, expiresAt: { $gt: now } });
  let rotate = true;
  if (!session) {
    // Another tab may have just rotated this token; accept the previous one briefly without rotating again.
    session = await Session.findOne({
      previousTokenHash: tokenHash,
      rotatedAt: { $gt: new Date(now.getTime() - REFRESH_GRACE_MS) },
      revokedAt: null,
      expiresAt: { $gt: now },
    });
    rotate = false;
  }
  if (!session) throw ApiError.unauthorized('Your session has ended. Please sign in again.');

  const user = await User.findOne({ _id: session.user, isActive: true }).lean();
  if (!user) {
    session.revokedAt = now;
    await session.save();
    throw ApiError.unauthorized();
  }

  let nextRefreshToken = null;
  if (rotate) {
    nextRefreshToken = generateOpaqueToken();
    session.set({
      previousTokenHash: tokenHash,
      rotatedAt: now,
      refreshTokenHash: hashToken(nextRefreshToken),
      expiresAt: refreshExpiry(),
    });
  }
  session.set({ lastUsedAt: now, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 400) });
  await session.save();

  const accessToken = signAccessToken({ userId: user._id, organizationId: user.organizationId, sessionId: session._id });
  return { accessToken, refreshToken: nextRefreshToken };
}

async function logout(sessionId) {
  if (!sessionId) return;
  await Session.updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function logoutByRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await Session.updateOne({ refreshTokenHash: hashToken(refreshToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function forgotPassword({ email }) {
  const user = await User.findOne({ email, isActive: true });
  // Same response whether or not the email exists.
  if (!user) return;
  const token = generateOpaqueToken();
  user.resetTokenHash = hashToken(token);
  user.resetTokenExpiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await user.save();

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  if (!isEmailEnabled()) {
    if (!env.isTest) console.warn(`[auth] Password reset requested for ${email} but no email provider is configured. Link: ${link}`);
    return;
  }
  const text = [
    `Hello ${user.name},`,
    '',
    'We received a request to reset your password. Open the link below to choose a new one:',
    link,
    '',
    `This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`,
  ].join('\n');
  try {
    await sendEmail({ to: user.email, subject: 'Reset your password', text });
  } catch (error) {
    console.error('[auth] could not send password reset email:', error.message);
  }
}

async function resetPassword({ token, password }) {
  const user = await User.findOne({ resetTokenHash: hashToken(token), resetTokenExpiresAt: { $gt: new Date() } });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired. Please request a new one.');
  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.passwordChangedAt = new Date();
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit(
    { organizationId: user.organizationId, userId: user._id, userName: user.name },
    { action: 'auth.password_reset', entity: { kind: 'user', id: user._id, label: user.name }, summary: `${user.name} reset their password` },
  );
}

/** Changes the password, signs out every other device and returns a fresh access token for this one. */
async function changePassword(ctx, { currentPassword, newPassword }) {
  const user = await User.findById(ctx.userId).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.unprocessable('Current password is incorrect', [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  // Back-date by 1s so the token issued below (same second) is still accepted by the iat check.
  user.passwordChangedAt = new Date(Date.now() - 1000);
  await user.save();
  await Session.updateMany({ user: user._id, _id: { $ne: ctx.sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit(ctx, { action: 'auth.password_changed', entity: { kind: 'user', id: user._id, label: user.name }, summary: `${user.name} changed their password` });
  return signAccessToken({ userId: user._id, organizationId: user.organizationId, sessionId: ctx.sessionId });
}

async function listSessions(ctx) {
  const sessions = await Session.find({ user: ctx.userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .select('userAgent ip lastUsedAt createdAt expiresAt')
    .lean();
  return sessions.map((session) => ({ ...session, current: String(session._id) === String(ctx.sessionId) }));
}

async function revokeSession(ctx, sessionId) {
  const result = await Session.updateOne({ _id: sessionId, user: ctx.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (result.matchedCount === 0) throw ApiError.notFound('Session');
}

module.exports = {
  login,
  refresh,
  logout,
  logoutByRefreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  listSessions,
  revokeSession,
  buildProfile,
};
