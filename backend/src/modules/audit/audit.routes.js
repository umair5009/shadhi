const { Router } = require('express');
const { AuditLog } = require('../../models');
const validate = require('../../middleware/validate');
const ApiError = require('../../utils/ApiError');
const { paginate, escapeRegex } = require('../../utils/listQuery');
const { z, objectId, listQueryShape } = require('../../utils/validation');

// The history of one record is visible to anyone who can view that kind of record;
// the organization-wide trail needs audit.view.
const ENTITY_PERMISSIONS = {
  booking: 'bookings.view',
  customer: 'customers.view',
  payment: 'payments.view',
  invoice: 'invoices.view',
  expense: 'expenses.view',
  staff: 'staff.view',
  inventoryItem: 'inventory.view',
  hall: 'halls.view',
  menuItem: 'menu.view',
  menuPackage: 'menu.view',
};

const query = z.object({
  ...listQueryShape,
  entityKind: z.string().max(40).optional(),
  entityId: objectId().optional(),
  action: z.string().max(60).optional(),
  actor: objectId().optional(),
});

const router = Router();

router.get('/', validate({ query }), async (req, res) => {
  const { entityKind, entityId, action, actor, q, page, limit } = req.valid.query;
  const scopedToOneRecord = entityKind && entityId;
  const allowed = req.ctx.can('audit.view') || (scopedToOneRecord && ENTITY_PERMISSIONS[entityKind] && req.ctx.can(ENTITY_PERMISSIONS[entityKind]));
  if (!allowed) throw ApiError.forbidden();

  const filter = {
    organizationId: req.ctx.organizationId,
    ...(entityKind ? { 'entity.kind': entityKind } : {}),
    ...(entityId ? { 'entity.id': entityId } : {}),
    ...(action ? { action: new RegExp(`^${escapeRegex(action)}`) } : {}),
    ...(actor ? { actor } : {}),
    ...(q ? { summary: new RegExp(escapeRegex(q), 'i') } : {}),
  };
  res.json(await paginate(AuditLog, filter, { page, limit, sort: { createdAt: -1 } }));
});

module.exports = router;
