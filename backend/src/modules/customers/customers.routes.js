const { Router } = require('express');
const customersService = require('./customers.service');
const schemas = require('./customers.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

router.get('/', authorize('customers.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await customersService.list(req.ctx, req.valid.query));
});

router.get('/lookup', authorize('customers.view'), validate({ query: schemas.lookupQuery }), async (req, res) => {
  res.json({ data: await customersService.lookup(req.ctx, req.valid.query) });
});

router.post('/', authorize('customers.create'), validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await customersService.create(req.ctx, req.valid.body) });
});

router.get('/:id', authorize('customers.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await customersService.get(req.ctx, req.valid.params.id) });
});

router.patch('/:id', authorize('customers.update'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await customersService.update(req.ctx, req.valid.params.id, req.valid.body) });
});

router.delete('/:id', authorize('customers.delete'), validate({ params: idParams }), async (req, res) => {
  await customersService.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

module.exports = router;
