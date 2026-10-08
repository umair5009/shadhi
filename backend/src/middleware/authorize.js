const ApiError = require('../utils/ApiError');

/** Requires every listed permission. */
function authorize(...permissions) {
  return (req, _res, next) => {
    if (!req.ctx) throw ApiError.unauthorized();
    if (!permissions.every((permission) => req.ctx.can(permission))) throw ApiError.forbidden();
    next();
  };
}

/** Requires at least one of the listed permissions. */
function authorizeAny(...permissions) {
  return (req, _res, next) => {
    if (!req.ctx) throw ApiError.unauthorized();
    if (!permissions.some((permission) => req.ctx.can(permission))) throw ApiError.forbidden();
    next();
  };
}

module.exports = { authorize, authorizeAny };
