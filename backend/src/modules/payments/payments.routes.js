const { Router } = require('express');
const paymentsService = require('./payments.service');
const schemas = require('./payments.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');
const { renderReceiptPdf } = require('../../pdf/receiptPdf');

const router = Router();

router.get('/', authorize('payments.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await paymentsService.list(req.ctx, req.valid.query));
});

router.post('/', authorize('payments.create'), validate({ body: schemas.receiveBody }), async (req, res) => {
  res.status(201).json({ data: await paymentsService.receive(req.ctx, req.valid.body) });
});

router.post('/refunds', authorize('payments.refund'), validate({ body: schemas.refundBody }), async (req, res) => {
  res.status(201).json({ data: await paymentsService.refund(req.ctx, req.valid.body) });
});

router.get('/:id', authorize('payments.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await paymentsService.get(req.ctx, req.valid.params.id) });
});

router.post('/:id/void', authorize('payments.void'), validate({ params: idParams, body: schemas.voidBody }), async (req, res) => {
  res.json({ data: await paymentsService.voidPayment(req.ctx, req.valid.params.id, req.valid.body) });
});

router.get('/:id/receipt.pdf', authorize('payments.view'), validate({ params: idParams }), async (req, res) => {
  const payment = await paymentsService.get(req.ctx, req.valid.params.id);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${payment.receiptNumber}.pdf"` });
  await renderReceiptPdf(req.ctx, payment, res);
});

module.exports = router;
