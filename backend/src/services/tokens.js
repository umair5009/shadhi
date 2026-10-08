const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ACCESS_COOKIE = 'sh_access';
const REFRESH_COOKIE = 'sh_refresh';

function signAccessToken({ userId, organizationId, sessionId }) {
  return jwt.sign({ org: String(organizationId), sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    expiresIn: env.JWT_ACCESS_TTL,
    algorithm: 'HS256',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

/** 256-bit random token. The raw value goes to the client; only its hash is stored. */
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function accessCookieOptions() {
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

module.exports = {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  verifyAccessToken,
  generateOpaqueToken,
  hashToken,
  accessCookieOptions,
  refreshCookieOptions,
};
