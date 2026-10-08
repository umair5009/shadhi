const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const DUPLICATE_MESSAGES = {
  phoneDigits: 'A customer with this phone number already exists',
  email: 'This email address is already in use',
  sku: 'Another item already uses this SKU',
  name: 'This name is already in use',
  key: 'This key is already in use',
  invoiceNumber: 'Invoice number already exists — please try again',
  receiptNumber: 'Receipt number already exists — please try again',
  bookingNumber: 'Booking number already exists — please try again',
  employeeCode: 'Employee code already exists',
  date: 'A record for this date already exists',
};

function send(res, status, code, message, details) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function notFoundHandler(req, res) {
  send(res, 404, 'NOT_FOUND', `No endpoint for ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (res.headersSent) {
    console.error(err);
    return res.end();
  }
  if (err instanceof ApiError) return send(res, err.status, err.code, err.message, err.details);

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((error) => ({ field: error.path, message: error.message }));
    return send(res, 422, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid data', details);
  }
  if (err.name === 'CastError') return send(res, 400, 'BAD_REQUEST', `Invalid value for ${err.path}`);
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {}).find((key) => key !== 'organizationId') ?? 'value';
    return send(res, 409, 'DUPLICATE', DUPLICATE_MESSAGES[field] ?? `This ${field} is already in use`, [{ field, message: DUPLICATE_MESSAGES[field] ?? 'Already in use' }]);
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${env.MAX_UPLOAD_MB} MB)` : 'File upload failed';
    return send(res, 400, 'UPLOAD_ERROR', message);
  }
  if (err.type === 'entity.parse.failed') return send(res, 400, 'BAD_REQUEST', 'Request body is not valid JSON');
  if (err.type === 'entity.too.large') return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request is too large');

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  return send(res, 500, 'INTERNAL_ERROR', env.isProduction ? 'Something went wrong. Please try again.' : err.message);
}

module.exports = { errorHandler, notFoundHandler };
