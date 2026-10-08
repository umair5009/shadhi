const { Router } = require('express');
const dashboardService = require('./dashboard.service');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { z, optionalDateOnly } = require('../../utils/validation');

const query = z.object({
  period: z.enum(['today', 'week', 'month', 'last_month', 'year', 'custom']).default('month'),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
});

const router = Router();

router.get('/', authorize('dashboard.view'), validate({ query }), async (req, res) => {
  res.json({ data: await dashboardService.getDashboard(req.ctx, req.valid.query) });
});

module.exports = router;
