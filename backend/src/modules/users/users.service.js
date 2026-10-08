const bcrypt = require('bcryptjs');
const { User, Role, Session } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, searchFilter } = require('../../utils/listQuery');
const { recordAudit } = require('../../services/audit');
const { BCRYPT_ROUNDS } = require('../auth/auth.constants');
const { SUPER_ADMIN_ROLE_KEY, ALL_PERMISSIONS } = require('../../config/permissions');

const SORTABLE = { name: 'name', email: 'email', lastLoginAt: 'lastLoginAt', createdAt: 'createdAt' };
const PUBLIC_FIELDS = '-passwordHash -resetTokenHash -resetTokenExpiresAt';

async function loadRole(ctx, roleId) {
  const role = await Role.findOne({ _id: roleId, organizationId: ctx.organizationId }).lean();
  if (!role) throw ApiError.unprocessable('Choose a valid role', [{ field: 'role', message: 'Choose a valid role' }]);
  return role;
}

/** A user may only hand out roles whose permissions they hold themselves. */
function assertCanAssign(ctx, role) {
  if (ctx.isSuperAdmin) return;
  const granted = role.key === SUPER_ADMIN_ROLE_KEY ? ALL_PERMISSIONS : role.permissions;
  if (role.key === SUPER_ADMIN_ROLE_KEY || granted.some((permission) => !ctx.can(permission))) {
    throw ApiError.forbidden('You cannot assign a role with more access than your own');
  }
}

async function countActiveSuperAdmins(organizationId) {
  const role = await Role.findOne({ organizationId, key: SUPER_ADMIN_ROLE_KEY }).select('_id').lean();
  return User.countDocuments({ organizationId, role: role._id, isActive: true });
}

async function list(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'email', 'phone']),
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
  };
  return paginate(User, filter, {
    page: query.page,
    limit: query.limit,
    sort: buildSort(query.sort, SORTABLE, { name: 1 }),
    select: PUBLIC_FIELDS,
    populate: { path: 'role', select: 'key name' },
  });
}

async function get(ctx, id) {
  const user = await User.findOne({ _id: id, organizationId: ctx.organizationId }).select(PUBLIC_FIELDS).populate('role', 'key name').lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}

async function create(ctx, input) {
  const role = await loadRole(ctx, input.role);
  assertCanAssign(ctx, role);
  const user = await User.create({
    organizationId: ctx.organizationId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: role._id,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  await recordAudit(ctx, {
    action: 'user.created',
    entity: { kind: 'user', id: user._id, label: user.name },
    summary: `Added user ${user.name} (${role.name})`,
  });
  return get(ctx, user._id);
}

async function update(ctx, id, input) {
  const user = await User.findOne({ _id: id, organizationId: ctx.organizationId }).populate('role');
  if (!user) throw ApiError.notFound('User');
  const isSelf = String(user._id) === String(ctx.userId);
  const currentlySuperAdmin = user.role.key === SUPER_ADMIN_ROLE_KEY;

  if (currentlySuperAdmin && !ctx.isSuperAdmin) throw ApiError.forbidden('Only a Super Admin can change another Super Admin');
  if (isSelf && input.isActive === false) throw ApiError.badRequest('You cannot deactivate your own account');
  if (isSelf && input.role && String(input.role) !== String(user.role._id)) throw ApiError.badRequest('You cannot change your own role');

  const before = { name: user.name, phone: user.phone, role: user.role.name, isActive: user.isActive };
  let newRole = user.role;
  if (input.role && String(input.role) !== String(user.role._id)) {
    newRole = await loadRole(ctx, input.role);
    assertCanAssign(ctx, newRole);
  }

  const losesSuperAdmin = currentlySuperAdmin && (newRole.key !== SUPER_ADMIN_ROLE_KEY || input.isActive === false);
  if (losesSuperAdmin && user.isActive && (await countActiveSuperAdmins(ctx.organizationId)) <= 1) {
    throw ApiError.badRequest('There must always be at least one active Super Admin');
  }

  user.set({
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    role: newRole._id,
    updatedBy: ctx.userId,
  });
  await user.save();

  // A deactivated user is signed out everywhere immediately.
  if (input.isActive === false) await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await recordAudit(ctx, {
    action: 'user.updated',
    entity: { kind: 'user', id: user._id, label: user.name },
    summary: `Updated user ${user.name}`,
    before,
    after: { name: user.name, phone: user.phone, role: newRole.name, isActive: user.isActive },
  });
  return get(ctx, user._id);
}

async function resetPassword(ctx, id, { password }) {
  const user = await User.findOne({ _id: id, organizationId: ctx.organizationId }).populate('role');
  if (!user) throw ApiError.notFound('User');
  if (user.role.key === SUPER_ADMIN_ROLE_KEY && !ctx.isSuperAdmin) throw ApiError.forbidden('Only a Super Admin can reset a Super Admin password');
  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.passwordChangedAt = new Date();
  user.updatedBy = ctx.userId;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit(ctx, {
    action: 'user.password_reset',
    entity: { kind: 'user', id: user._id, label: user.name },
    summary: `Reset the password for ${user.name}`,
  });
}

module.exports = { list, get, create, update, resetPassword };
