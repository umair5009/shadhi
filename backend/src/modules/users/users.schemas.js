const { z, requiredText, email, optionalPhone, password, objectId, booleanish, listQueryShape } = require('../../utils/validation');

const listQuery = z.object({
  ...listQueryShape,
  role: objectId().optional(),
  isActive: booleanish().optional(),
});

const createBody = z.object({
  name: requiredText('Name', 100),
  email: email(),
  phone: optionalPhone(),
  role: objectId('Choose a role'),
  password: password(),
});

const updateBody = z
  .object({
    name: requiredText('Name', 100),
    phone: optionalPhone(),
    role: objectId('Choose a role'),
    isActive: z.boolean(),
  })
  .partial();

const resetPasswordBody = z.object({ password: password() });

module.exports = { listQuery, createBody, updateBody, resetPasswordBody };
