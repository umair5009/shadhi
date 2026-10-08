const { Router } = require('express');
const usersService = require('./users.service');
const schemas = require('./users.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

router.use(authorize('users.manage'));

router.get('/', validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await usersService.list(req.ctx, req.valid.query));
});

router.post('/', validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await usersService.create(req.ctx, req.valid.body) });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  res.json({ data: await usersService.get(req.ctx, req.valid.params.id) });
});

router.patch('/:id', validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await usersService.update(req.ctx, req.valid.params.id, req.valid.body) });
});

router.post('/:id/reset-password', validate({ params: idParams, body: schemas.resetPasswordBody }), async (req, res) => {
  await usersService.resetPassword(req.ctx, req.valid.params.id, req.valid.body);
  res.json({ data: { message: 'Password updated. The user has been signed out of all devices.' } });
});

module.exports = router;
