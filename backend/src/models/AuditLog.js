const { Schema, model } = require('mongoose');
const immutablePlugin = require('./plugins/immutable');

// Who did what, when — with before/after values for changes. Also feeds the dashboard's "Recent activity".
const auditLogSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String },
    action: { type: String, required: true },
    entity: {
      kind: { type: String, required: true },
      id: { type: Schema.Types.ObjectId },
      label: { type: String },
    },
    summary: { type: String, required: true, maxlength: 500 },
    changes: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.plugin(immutablePlugin, { label: 'An audit entry' });
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, 'entity.kind': 1, 'entity.id': 1, createdAt: -1 });
auditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });

module.exports = model('AuditLog', auditLogSchema);
