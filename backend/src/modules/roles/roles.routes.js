const { Router } = require('express');
const rolesService = require('./roles.service');
const schemas = require('./roles.schemas');
const validate = require('../../middleware/validate');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

// Reading roles is needed by the Users screen as well as the Roles screen.
router.get('/', authorizeAny('roles.manage', 'users.manage'), async (req, res) => {
  res.json({ data: await rolesService.list(req.ctx) });
});

router.get('/permissions', authorizeAny('roles.manage', 'users.manage'), (_req, res) => {
  res.json({ data: rolesService.catalog() });
});

router.post('/', authorize('roles.manage'), validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await rolesService.create(req.ctx, req.valid.body) });
});

router.patch('/:id', authorize('roles.manage'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await rolesService.update(req.ctx, req.valid.params.id, req.valid.body) });
});

router.delete('/:id', authorize('roles.manage'), validate({ params: idParams }), async (req, res) => {
  await rolesService.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

module.exports = router;
