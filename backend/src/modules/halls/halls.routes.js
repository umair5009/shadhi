const { Router } = require('express');
const hallsService = require('./halls.service');
const schemas = require('./halls.schemas');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

router.get('/', authorize('halls.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await hallsService.list(req.ctx, req.valid.query));
});

router.get('/availability', authorize('halls.view'), validate({ query: schemas.availabilityQuery }), async (req, res) => {
  res.json({ data: await hallsService.availability(req.ctx, req.valid.query) });
});

router.post('/', authorize('halls.manage'), validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await hallsService.create(req.ctx, req.valid.body) });
});

router.get('/:id', authorize('halls.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await hallsService.get(req.ctx, req.valid.params.id) });
});

router.patch('/:id', authorize('halls.manage'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await hallsService.update(req.ctx, req.valid.params.id, req.valid.body) });
});

router.delete('/:id', authorize('halls.manage'), validate({ params: idParams }), async (req, res) => {
  await hallsService.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

router.post('/:id/images', authorize('halls.manage'), validate({ params: idParams }), upload.array('images', 6), async (req, res) => {
  res.json({ data: await hallsService.addImages(req.ctx, req.valid.params.id, req.files) });
});

router.delete('/:id/images', authorize('halls.manage'), validate({ params: idParams, query: schemas.imageQuery }), async (req, res) => {
  res.json({ data: await hallsService.removeImage(req.ctx, req.valid.params.id, req.valid.query.key) });
});

module.exports = router;
