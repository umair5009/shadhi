const { Schema } = require('mongoose');

/**
 * Makes a schema tenant-owned and auditable:
 *  - organizationId (required) — every query is scoped by it. Each model declares compound indexes that
 *    start with organizationId, so no standalone index is added here.
 *  - createdBy / updatedBy — who touched the record (createdAt/updatedAt come from `timestamps`)
 */
function tenantPlugin(schema) {
  schema.add({
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  });
}

module.exports = tenantPlugin;
