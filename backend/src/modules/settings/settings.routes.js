const { Router } = require('express');
const settingsService = require('./settings.service');
const schemas = require('./settings.schemas');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authorize } = require('../../middleware/authorize');

const router = Router();

router.get('/business', authorize('settings.view'), async (req, res) => {
  res.json({ data: await settingsService.getBusiness(req.ctx) });
});

router.put('/business', authorize('settings.update'), validate({ body: schemas.businessBody }), async (req, res) => {
  res.json({ data: await settingsService.updateBusiness(req.ctx, req.valid.body) });
});

router.post('/business/logo', authorize('settings.update'), upload.single('logo'), async (req, res) => {
  res.json({ data: await settingsService.updateLogo(req.ctx, req.file) });
});

router.delete('/business/logo', authorize('settings.update'), async (req, res) => {
  res.json({ data: await settingsService.removeLogo(req.ctx) });
});

router.get('/system', authorize('settings.view'), async (req, res) => {
  res.json({ data: await settingsService.getSystem(req.ctx) });
});

router.put('/system', authorize('settings.update'), validate({ body: schemas.systemBody }), async (req, res) => {
  res.json({ data: await settingsService.updateSystem(req.ctx, req.valid.body) });
});

module.exports = router;
