const { Router } = require('express');
const controller = require('./auth.controller');
const schemas = require('./auth.schemas');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');
const { loginLimiter, passwordResetLimiter } = require('../../middleware/security');

const router = Router();

router.post('/login', loginLimiter, validate({ body: schemas.loginBody }), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/forgot-password', passwordResetLimiter, validate({ body: schemas.forgotPasswordBody }), controller.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate({ body: schemas.resetPasswordBody }), controller.resetPassword);

router.get('/me', authenticate, controller.me);
router.post('/change-password', authenticate, validate({ body: schemas.changePasswordBody }), controller.changePassword);
router.get('/sessions', authenticate, controller.listSessions);
router.delete('/sessions/:id', authenticate, validate({ params: schemas.sessionParams }), controller.revokeSession);

module.exports = router;
