const bcrypt = require('bcryptjs');
const { Organization, Role, User, BusinessSetting, SystemSetting, ExpenseCategory } = require('../../models');
const { DEFAULT_ROLES, SUPER_ADMIN_ROLE_KEY } = require('../../config/permissions');
const { DEFAULT_EXPENSE_CATEGORIES } = require('../../config/shared');
const { BCRYPT_ROUNDS } = require('../auth/auth.constants');

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'hall';
}

/**
 * Creates a tenant with everything it needs to work on day one: default roles, business & system settings,
 * expense categories and the owner account (Super Admin).
 */
async function createOrganization({ name, owner, business = {} }) {
  const organization = await Organization.create({ name, slug: `${slugify(name)}-${Date.now().toString(36)}` });
  const organizationId = organization._id;

  const roles = await Role.insertMany(
    DEFAULT_ROLES.map((role) => ({ ...role, organizationId, isSystem: true })),
  );
  await BusinessSetting.create({ organizationId, name, ...business });
  await SystemSetting.create({ organizationId });
  await ExpenseCategory.insertMany(
    DEFAULT_EXPENSE_CATEGORIES.map((category) => ({ ...category, organizationId, isSystem: true })),
  );

  const superAdminRole = roles.find((role) => role.key === SUPER_ADMIN_ROLE_KEY);
  const ownerUser = await User.create({
    organizationId,
    name: owner.name,
    email: owner.email,
    phone: owner.phone,
    passwordHash: await bcrypt.hash(owner.password, BCRYPT_ROUNDS),
    role: superAdminRole._id,
  });

  return { organization, roles, owner: ownerUser };
}

module.exports = { createOrganization, slugify };
