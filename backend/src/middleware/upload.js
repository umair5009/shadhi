const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

// Files are kept in memory only long enough for services/storage.js to verify their content and write them to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED.has(file.mimetype)) callback(null, true);
    else callback(ApiError.badRequest('Only PNG, JPG, WEBP images or PDF files are allowed'));
  },
});

module.exports = upload;
