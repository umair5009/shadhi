const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const limiterDefaults = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: (_req, res, _next, options) =>
    res.status(options.statusCode).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } }),
};

/** General API limit per client IP. */
const apiLimiter = rateLimit({ ...limiterDefaults, windowMs: 5 * 60 * 1000, limit: 1000 });

/** Login: limited per IP + email so one attacker can't lock out a user from elsewhere. */
const loginLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase()}`,
});

/** Password reset endpoints. */
const passwordResetLimiter = rateLimit({ ...limiterDefaults, windowMs: 15 * 60 * 1000, limit: 5 });

function hasOperatorKey(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasOperatorKey(item, depth + 1));
  return Object.entries(value).some(([key, inner]) => key.startsWith('$') || key.includes('.') || hasOperatorKey(inner, depth + 1));
}

/** Rejects request bodies containing MongoDB operators ($gt, $where…) or dotted keys. */
function rejectMongoOperators(req, _res, next) {
  if (req.body && hasOperatorKey(req.body)) throw ApiError.badRequest('Request contains invalid field names');
  next();
}

module.exports = { apiLimiter, loginLimiter, passwordResetLimiter, rejectMongoOperators };
