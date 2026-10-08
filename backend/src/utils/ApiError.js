class ApiError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code machine-readable code the frontend can branch on
   * @param {string} message human-readable message shown to staff
   * @param {unknown} [details] field errors, conflicts, …
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Please sign in to continue', code = 'UNAUTHENTICATED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to do this') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(what = 'Record') {
    return new ApiError(404, 'NOT_FOUND', `${what} not found`);
  }

  static conflict(message, details, code = 'CONFLICT') {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(message, details) {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
}

module.exports = ApiError;
