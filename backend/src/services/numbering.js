const { Counter } = require('../models');

/**
 * Atomically returns the next number in a sequence. Safe under concurrent requests: the increment happens inside
 * MongoDB in one operation, so two requests can never receive the same number.
 * @param {import('mongoose').Types.ObjectId} organizationId
 * @param {string} key e.g. 'invoice:2026'
 * @param {number} [startAt] first number to hand out if the sequence is new (or currently lower)
 */
async function nextSequence(organizationId, key, startAt = 1) {
  const counter = await Counter.findOneAndUpdate(
    { organizationId, key },
    [
      {
        $set: {
          organizationId,
          key,
          seq: { $add: [{ $max: [{ $ifNull: ['$seq', 0] }, startAt - 1] }, 1] },
        },
      },
    ],
    { upsert: true, returnDocument: 'after', updatePipeline: true },
  ).lean();
  return counter.seq;
}

/**
 * Formats a yearly document number: PREFIX-YYYY-00001.
 * @param {object} options
 * @param {string} options.prefix
 * @param {number} options.year
 * @param {string} options.sequenceKey counter name without the year
 */
async function nextDocumentNumber(organizationId, { prefix, year, sequenceKey, startAt = 1, pad = 5 }) {
  const seq = await nextSequence(organizationId, `${sequenceKey}:${year}`, startAt);
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
}

/** Non-yearly code, e.g. EMP-0007. */
async function nextCode(organizationId, { prefix, sequenceKey, pad = 4 }) {
  const seq = await nextSequence(organizationId, sequenceKey);
  return `${prefix}-${String(seq).padStart(pad, '0')}`;
}

module.exports = { nextSequence, nextDocumentNumber, nextCode };
