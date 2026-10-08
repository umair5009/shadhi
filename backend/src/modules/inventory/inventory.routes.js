const { Router } = require('express');
const inventoryService = require('./inventory.service');
const schemas = require('./inventory.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();
const canView = authorize('inventory.view');
const canManage = authorize('inventory.manage');
const canTransact = authorize('inventory.transact');

// Suppliers
router.get('/suppliers', canView, validate({ query: schemas.supplierListQuery }), async (req, res) => {
  res.json(await inventoryService.listSuppliers(req.ctx, req.valid.query));
});
router.post('/suppliers', canManage, validate({ body: schemas.supplierBody }), async (req, res) => {
  res.status(201).json({ data: await inventoryService.createSupplier(req.ctx, req.valid.body) });
});
router.patch('/suppliers/:id', canManage, validate({ params: idParams, body: schemas.supplierUpdateBody }), async (req, res) => {
  res.json({ data: await inventoryService.updateSupplier(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/suppliers/:id', canManage, validate({ params: idParams }), async (req, res) => {
  await inventoryService.removeSupplier(req.ctx, req.valid.params.id);
  res.status(204).end();
});

// Items
router.get('/items', canView, validate({ query: schemas.itemListQuery }), async (req, res) => {
  res.json(await inventoryService.listItems(req.ctx, req.valid.query));
});
router.get('/categories', canView, async (req, res) => {
  res.json({ data: await inventoryService.listCategories(req.ctx) });
});
router.post('/items', canManage, validate({ body: schemas.itemBody }), async (req, res) => {
  res.status(201).json({ data: await inventoryService.createItem(req.ctx, req.valid.body) });
});
router.get('/items/:id', canView, validate({ params: idParams }), async (req, res) => {
  res.json({ data: await inventoryService.getItem(req.ctx, req.valid.params.id) });
});
router.patch('/items/:id', canManage, validate({ params: idParams, body: schemas.itemUpdateBody }), async (req, res) => {
  res.json({ data: await inventoryService.updateItem(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/items/:id', canManage, validate({ params: idParams }), async (req, res) => {
  await inventoryService.removeItem(req.ctx, req.valid.params.id);
  res.status(204).end();
});
router.post('/items/:id/reconcile', canManage, validate({ params: idParams }), async (req, res) => {
  res.json({ data: await inventoryService.reconcile(req.ctx, req.valid.params.id) });
});

// Stock movements
router.get('/transactions', canView, validate({ query: schemas.transactionListQuery }), async (req, res) => {
  res.json(await inventoryService.listTransactions(req.ctx, req.valid.query));
});
router.post('/transactions', canTransact, validate({ body: schemas.transactionBody }), async (req, res) => {
  const body = req.valid.body;
  // Posting a purchase as an expense is spending money, which needs expense rights.
  const recordExpense = body.type === 'purchase' && body.recordExpense && req.ctx.can('expenses.create');
  res.status(201).json({ data: await inventoryService.recordTransaction(req.ctx, { ...body, recordExpense }) });
});

module.exports = router;
