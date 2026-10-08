const { z, email, password, objectId } = require('../../utils/validation');

const loginBody = z.object({
  email: email(),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
});

const forgotPasswordBody = z.object({ email: email() });

const resetPasswordBody = z.object({
  token: z.string().min(20, 'This reset link is invalid').max(200),
  password: password(),
});

const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: password(),
  })
  .refine((body) => body.currentPassword !== body.newPassword, {
    message: 'New password must be different from the current one',
    path: ['newPassword'],
  });

const sessionParams = z.object({ id: objectId('Invalid session') });

module.exports = { loginBody, forgotPasswordBody, resetPasswordBody, changePasswordBody, sessionParams };
