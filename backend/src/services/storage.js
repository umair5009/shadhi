const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Local-disk file storage. Files live under <UPLOAD_DIR>/<organizationId>/ and are served only to users of that
// organization through GET /api/files/:orgId/:name. Swap this module for S3/Cloud storage without touching callers.

const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const SIGNATURES = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
];

/** Checks the file's first bytes so a renamed executable can't pass as an image. */
function sniffMime(buffer) {
  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => buffer[index] === byte)) return signature.mime;
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * @param {import('mongoose').Types.ObjectId|string} organizationId
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number }} file multer memory file
 * @param {{ imagesOnly?: boolean }} [options]
 */
async function saveFile(organizationId, file, { imagesOnly = false } = {}) {
  const mime = sniffMime(file.buffer);
  if (!mime || (imagesOnly && !mime.startsWith('image/'))) {
    throw ApiError.badRequest(imagesOnly ? 'Please upload a PNG, JPG or WEBP image' : 'Please upload an image or PDF file');
  }
  const orgFolder = String(organizationId);
  const name = `${crypto.randomUUID()}${EXTENSIONS[mime]}`;
  const directory = path.join(env.uploadDir, orgFolder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, name), file.buffer, { flag: 'wx' });
  const key = `${orgFolder}/${name}`;
  return { key, url: `/api/files/${key}`, name: file.originalname.slice(0, 200), mimeType: mime, size: file.size };
}

/** Absolute path of a stored file, or null if the key is malformed. */
function resolveFile(key) {
  if (!/^[a-f0-9]{24}\/[a-f0-9-]{36}\.(png|jpg|webp|pdf)$/.test(key)) return null;
  return path.join(env.uploadDir, key);
}

async function readFile(key) {
  const filePath = resolveFile(key);
  if (!filePath) return null;
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function removeFile(key) {
  const filePath = resolveFile(key);
  if (!filePath) return;
  await fs.rm(filePath, { force: true });
}

module.exports = { saveFile, resolveFile, readFile, removeFile };
