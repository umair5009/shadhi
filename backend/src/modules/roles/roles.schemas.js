const { z, requiredText, optionalText } = require('../../utils/validation');
const { ALL_PERMISSIONS } = require('../../config/permissions');

const permissionList = z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length);

const createBody = z.object({
  name: requiredText('Role name', 60),
  description: optionalText(300),
  permissions: permissionList.default([]),
});

const updateBody = z.object({
  name: requiredText('Role name', 60).optional(),
  description: optionalText(300),
  permissions: permissionList.optional(),
});

module.exports = { createBody, updateBody };
