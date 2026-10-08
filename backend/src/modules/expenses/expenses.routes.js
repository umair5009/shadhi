const { Router } = require('express');
const expensesService = require('./expenses.service');
const schemas = require('./expenses.schemas');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

// Categories are also needed by anyone adding an expense.
router.get('/categories', authorizeAny('expenses.view', 'expenses.create'), async (req, res) => {
  res.json({ data: await expensesService.listCategories(req.ctx) });
});
router.post('/categories', authorize('expenses.update'), validate({ body: schemas.categoryBody }), async (req, res) => {
  res.status(201).json({ data: await expensesService.createCategory(req.ctx, req.valid.body) });
});
router.patch('/categories/:id', authorize('expenses.update'), validate({ params: idParams, body: schemas.categoryUpdateBody }), async (req, res) => {
  res.json({ data: await expensesService.updateCategory(req.ctx, req.valid.params.id, req.valid.body) });
});

router.get('/', authorize('expenses.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await expensesService.list(req.ctx, req.valid.query));
});

router.post('/', authorize('expenses.create'), validate({ body: schemas.createBody }), async (req, res) => {
  const expense = await expensesService.create(req.ctx, { ...req.valid.body, source: 'manual' });
  res.status(201).json({ data: await expensesService.get(req.ctx, expense._id) });
});

router.get('/:id', authorize('expenses.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await expensesService.get(req.ctx, req.valid.params.id) });
});

router.patch('/:id', authorize('expenses.update'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await expensesService.update(req.ctx, req.valid.params.id, req.valid.body) });
});

router.post('/:id/receipt', authorizeAny('expenses.create', 'expenses.update'), validate({ params: idParams }), upload.single('receipt'), async (req, res) => {
  res.json({ data: await expensesService.setReceipt(req.ctx, req.valid.params.id, req.file) });
});

router.post('/:id/void', authorize('expenses.void'), validate({ params: idParams, body: schemas.voidBody }), async (req, res) => {
  res.json({ data: await expensesService.voidExpense(req.ctx, req.valid.params.id, req.valid.body) });
});

module.exports = router;
