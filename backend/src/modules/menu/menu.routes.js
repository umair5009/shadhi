const { Router } = require('express');
const menuService = require('./menu.service');
const schemas = require('./menu.schemas');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();
const canView = authorize('menu.view');
const canManage = authorize('menu.manage');

// Categories
router.get('/categories', canView, async (req, res) => {
  res.json({ data: await menuService.listCategories(req.ctx) });
});
router.post('/categories', canManage, validate({ body: schemas.categoryBody }), async (req, res) => {
  res.status(201).json({ data: await menuService.createCategory(req.ctx, req.valid.body) });
});
router.patch('/categories/:id', canManage, validate({ params: idParams, body: schemas.categoryUpdateBody }), async (req, res) => {
  res.json({ data: await menuService.updateCategory(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/categories/:id', canManage, validate({ params: idParams }), async (req, res) => {
  await menuService.removeCategory(req.ctx, req.valid.params.id);
  res.status(204).end();
});

// Dishes
router.get('/items', canView, validate({ query: schemas.itemListQuery }), async (req, res) => {
  res.json(await menuService.listItems(req.ctx, req.valid.query));
});
router.post('/items', canManage, validate({ body: schemas.itemBody }), async (req, res) => {
  res.status(201).json({ data: await menuService.createItem(req.ctx, req.valid.body) });
});
router.get('/items/:id', canView, validate({ params: idParams }), async (req, res) => {
  res.json({ data: await menuService.getItem(req.ctx, req.valid.params.id) });
});
router.patch('/items/:id', canManage, validate({ params: idParams, body: schemas.itemUpdateBody }), async (req, res) => {
  res.json({ data: await menuService.updateItem(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/items/:id', canManage, validate({ params: idParams }), async (req, res) => {
  await menuService.removeItem(req.ctx, req.valid.params.id);
  res.status(204).end();
});
router.post('/items/:id/image', canManage, validate({ params: idParams }), upload.single('image'), async (req, res) => {
  res.json({ data: await menuService.setItemImage(req.ctx, req.valid.params.id, req.file) });
});

// Packages
router.get('/packages', canView, validate({ query: schemas.packageListQuery }), async (req, res) => {
  res.json({ data: await menuService.listPackages(req.ctx, req.valid.query) });
});
router.post('/packages', canManage, validate({ body: schemas.packageBody }), async (req, res) => {
  res.status(201).json({ data: await menuService.createPackage(req.ctx, req.valid.body) });
});
router.get('/packages/:id', canView, validate({ params: idParams }), async (req, res) => {
  res.json({ data: await menuService.getPackage(req.ctx, req.valid.params.id) });
});
router.patch('/packages/:id', canManage, validate({ params: idParams, body: schemas.packageUpdateBody }), async (req, res) => {
  res.json({ data: await menuService.updatePackage(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/packages/:id', canManage, validate({ params: idParams }), async (req, res) => {
  res.json({ data: await menuService.removePackage(req.ctx, req.valid.params.id) });
});

// Usage statistics
router.get('/usage', canView, validate({ query: schemas.usageQuery }), async (req, res) => {
  res.json({ data: await menuService.usage(req.ctx, req.valid.query) });
});

module.exports = router;
