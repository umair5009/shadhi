const { Router } = require('express');
const storage = require('../../services/storage');
const ApiError = require('../../utils/ApiError');

const CONTENT_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };

const router = Router();

// Serves uploaded files (logos, hall photos, expense receipts) to signed-in users of the owning organization only.
router.get('/:orgId/:name', async (req, res) => {
  const { orgId, name } = req.params;
  if (orgId !== String(req.ctx.organizationId)) throw ApiError.notFound('File');
  const key = `${orgId}/${name}`;
  const content = await storage.readFile(key);
  if (!content) throw ApiError.notFound('File');
  const extension = name.split('.').pop();
  res.set({
    'Content-Type': CONTENT_TYPES[extension],
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  if (extension === 'pdf') res.set('Content-Disposition', 'inline');
  res.send(content);
});

module.exports = router;
