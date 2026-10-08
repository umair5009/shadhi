const { AuditLog } = require('../models');

const IGNORED_KEYS = new Set(['updatedAt', 'updatedBy', 'createdAt', '__v']);

function normalise(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

/** Top-level fields whose values differ between two plain objects. */
function diff(before, after) {
  const beforePlain = normalise(before) ?? {};
  const afterPlain = normalise(after) ?? {};
  const keys = new Set([...Object.keys(beforePlain), ...Object.keys(afterPlain)]);
  const changes = { before: {}, after: {} };
  for (const key of keys) {
    if (IGNORED_KEYS.has(key)) continue;
    if (JSON.stringify(beforePlain[key]) !== JSON.stringify(afterPlain[key])) {
      changes.before[key] = beforePlain[key] ?? null;
      changes.after[key] = afterPlain[key] ?? null;
    }
  }
  return Object.keys(changes.after).length ? changes : null;
}

/**
 * Writes an audit entry. Never throws: the business write has already happened and an audit failure must not turn a
 * successful action into an error response. Failures are logged loudly instead.
 * @param {object} ctx request context (organizationId, userId, userName, ip)
 * @param {object} entry
 * @param {string} entry.action e.g. 'payment.received'
 * @param {{ kind: string, id?: unknown, label?: string }} entry.entity
 * @param {string} entry.summary one line a person can read
 * @param {object} [entry.before]
 * @param {object} [entry.after]
 */
async function recordAudit(ctx, { action, entity, summary, before, after }) {
  try {
    const changes = before || after ? (before && after ? diff(before, after) : { before: normalise(before), after: normalise(after) }) : undefined;
    await AuditLog.create({
      organizationId: ctx.organizationId,
      actor: ctx.userId,
      actorName: ctx.userName,
      action,
      entity,
      summary,
      changes,
      ip: ctx.ip,
    });
  } catch (error) {
    console.error(`[audit] failed to record ${action}:`, error.message);
  }
}

module.exports = { recordAudit, diff };
