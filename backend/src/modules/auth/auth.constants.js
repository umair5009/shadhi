const env = require('../../config/env');

// bcrypt work factor. Tests use a low factor purely for speed.
const BCRYPT_ROUNDS = env.isTest ? 4 : 12;

// A rotated refresh token stays usable this long, so two tabs refreshing at the same moment don't sign each other out.
const REFRESH_GRACE_MS = 30 * 1000;

module.exports = { BCRYPT_ROUNDS, REFRESH_GRACE_MS };
