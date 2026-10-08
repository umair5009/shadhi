const { Router } = require('express');
const bookingsService = require('./bookings.service');
const schemas = require('./bookings.schemas');
const validate = require('../../middleware/validate');
const { authorize, authorizeAny } = require('../../middleware/authorize');
const expensesService = require('../expenses/expenses.service');
const { idParams } = require('../../utils/validation');
const ApiError = require('../../utils/ApiError');

const router = Router();

router.get('/', authorize('bookings.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await bookingsService.list(req.ctx, req.valid.query));
});

router.get('/calendar', authorize('bookings.view'), validate({ query: schemas.calendarQuery }), async (req, res) => {
  res.json({ data: await bookingsService.calendar(req.ctx, req.valid.query) });
});

router.post('/check-availability', authorize('bookings.view'), validate({ body: schemas.availabilityBody }), async (req, res) => {
  res.json({ data: await bookingsService.availabilityFor(req.ctx, req.valid.body) });
});

router.post('/', authorize('bookings.create'), validate({ body: schemas.createBody }), async (req, res) => {
  const body = req.valid.body;
  if (body.advancePayment && !req.ctx.can('payments.create')) throw ApiError.forbidden('You do not have permission to receive payments');
  // Confirming a booking reserves the hall, which needs the status permission.
  if (body.status !== 'inquiry' && body.status !== 'tentative' && !req.ctx.can('bookings.status')) {
    throw ApiError.forbidden('You can only save new bookings as inquiry or tentative');
  }
  const { booking, warnings } = await bookingsService.create(req.ctx, body);
  res.status(201).json({ data: booking, meta: { warnings } });
});

router.get('/:id', authorize('bookings.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await bookingsService.get(req.ctx, req.valid.params.id) });
});

router.patch('/:id', authorize('bookings.update'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  const { booking, warnings } = await bookingsService.update(req.ctx, req.valid.params.id, req.valid.body);
  res.json({ data: booking, meta: { warnings } });
});

// Event profitability is financial information, so it needs expenses or reports access as well.
router.get('/:id/profitability', authorize('bookings.view'), authorizeAny('expenses.view', 'reports.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await expensesService.bookingProfitability(req.ctx, req.valid.params.id) });
});

router.post('/:id/status', authorize('bookings.status'), validate({ params: idParams, body: schemas.statusBody }), async (req, res) => {
  res.json({ data: await bookingsService.changeStatus(req.ctx, req.valid.params.id, req.valid.body) });
});

module.exports = router;
