const { Role, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { recordAudit } = require('../../services/audit');
const { PERMISSION_GROUPS, SUPER_ADMIN_ROLE_KEY } = require('../../config/permissions');
const { slugify } = require('../organizations/organization.service');

function catalog() {
  return PERMISSION_GROUPS;
}

async function list(ctx) {
  const [roles, counts] = await Promise.all([
    Role.find({ organizationId: ctx.organizationId }).sort({ isSystem: -1, name: 1 }).lean(),
    User.aggregate([{ $match: { organizationId: ctx.organizationId } }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
  ]);
  const countByRole = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  return roles.map((role) => ({
    ...role,
    userCount: countByRole.get(String(role._id)) ?? 0,
    isLocked: role.key === SUPER_ADMIN_ROLE_KEY,
  }));
}

/** Nobody may grant permissions they don't hold themselves. */
function assertCanGrant(ctx, permissions) {
  const missing = permissions.filter((permission) => !ctx.can(permission));
  if (missing.length) throw ApiError.forbidden('You cannot grant permissions you do not have yourself');
}

async function create(ctx, input) {
  assertCanGrant(ctx, input.permissions);
  let key = slugify(input.name).replace(/-/g, '_');
  if (await Role.exists({ organizationId: ctx.organizationId, key })) key = `${key}_${Date.now().toString(36)}`;
  const role = await Role.create({
    organizationId: ctx.organizationId,
    key,
    name: input.name,
    description: input.description,
    permissions: [...new Set(input.permissions)],
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  await recordAudit(ctx, {
    action: 'role.created',
    entity: { kind: 'role', id: role._id, label: role.name },
    summary: `Created role ${role.name} with ${role.permissions.length} permissions`,
  });
  return role.toJSON();
}

async function update(ctx, id, input) {
  const role = await Role.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!role) throw ApiError.notFound('Role');
  if (role.key === SUPER_ADMIN_ROLE_KEY) throw ApiError.badRequest('The Super Admin role always has full access and cannot be edited');
  if (input.permissions) {
    // Only additions are checked: removing a permission the actor lacks is not an escalation.
    const added = input.permissions.filter((permission) => !role.permissions.includes(permission));
    assertCanGrant(ctx, added);
  }
  const before = { name: role.name, description: role.description, permissions: [...role.permissions] };
  role.set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.permissions ? { permissions: [...new Set(input.permissions)] } : {}),
    updatedBy: ctx.userId,
  });
  await role.save();
  await recordAudit(ctx, {
    action: 'role.updated',
    entity: { kind: 'role', id: role._id, label: role.name },
    summary: `Updated role ${role.name}`,
    before,
    after: { name: role.name, description: role.description, permissions: role.permissions },
  });
  return role.toJSON();
}

async function remove(ctx, id) {
  const role = await Role.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!role) throw ApiError.notFound('Role');
  if (role.isSystem) throw ApiError.badRequest('Built-in roles cannot be deleted');
  const userCount = await User.countDocuments({ organizationId: ctx.organizationId, role: role._id });
  if (userCount) throw ApiError.conflict(`This role is assigned to ${userCount} user(s). Move them to another role first.`);
  await role.deleteOne();
  await recordAudit(ctx, { action: 'role.deleted', entity: { kind: 'role', id: role._id, label: role.name }, summary: `Deleted role ${role.name}` });
}

module.exports = { catalog, list, create, update, remove };
