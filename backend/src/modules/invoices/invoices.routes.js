const { Router } = require('express');
const invoicesService = require('./invoices.service');
const schemas = require('./invoices.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');
const { renderInvoicePdf } = require('../../pdf/invoicePdf');

const router = Router();

router.get('/', authorize('invoices.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await invoicesService.list(req.ctx, req.valid.query));
});

router.post('/', authorize('invoices.create'), validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await invoicesService.create(req.ctx, req.valid.body) });
});

router.get('/:id', authorize('invoices.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await invoicesService.get(req.ctx, req.valid.params.id) });
});

router.post('/:id/void', authorize('invoices.void'), validate({ params: idParams, body: schemas.voidBody }), async (req, res) => {
  res.json({ data: await invoicesService.voidInvoice(req.ctx, req.valid.params.id, req.valid.body) });
});

router.get('/:id/pdf', authorize('invoices.view'), validate({ params: idParams }), async (req, res) => {
  const invoice = await invoicesService.get(req.ctx, req.valid.params.id);
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${invoice.invoiceNumber}.pdf"` });
  await renderInvoicePdf(invoice, res);
});

module.exports = router;
