const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { ACCESS_COOKIE, verifyAccessToken } = require('../services/tokens');
const { SUPER_ADMIN_ROLE_KEY, ALL_PERMISSIONS } = require('../config/permissions');

function readToken(req) {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Builds the context object passed to every service call: who is acting, for which organization, with what rights.
 * @returns {{ organizationId, userId, userName, sessionId, roleKey, isSuperAdmin, permissions: Set<string>, can: (p: string) => boolean, ip: string }}
 */
function buildContext(user, sessionId, req) {
  const isSuperAdmin = user.role.key === SUPER_ADMIN_ROLE_KEY;
  const permissions = new Set(isSuperAdmin ? ALL_PERMISSIONS : user.role.permissions);
  return {
    organizationId: user.organizationId,
    userId: user._id,
    userName: user.name,
    sessionId,
    roleKey: user.role.key,
    isSuperAdmin,
    permissions,
    can: (permission) => permissions.has(permission),
    ip: req.ip,
  };
}

/** Verifies the access token and loads the user fresh, so deactivation and permission changes apply immediately. */
async function authenticate(req, _res, next) {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') throw ApiError.unauthorized('Your session has expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized();
  }

  const user = await User.findOne({ _id: payload.sub, organizationId: payload.org, isActive: true }).populate('role').lean();
  if (!user || !user.role) throw ApiError.unauthorized();

  // Tokens issued before a password change are no longer valid.
  if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
    throw ApiError.unauthorized('Your password was changed. Please sign in again.');
  }

  req.user = user;
  req.ctx = buildContext(user, payload.sid, req);
  next();
}

module.exports = { authenticate, buildContext };
