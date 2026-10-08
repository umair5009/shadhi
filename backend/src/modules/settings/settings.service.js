const { BusinessSetting, SystemSetting } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { recordAudit } = require('../../services/audit');
const { invalidateSettings } = require('../../services/settings');
const storage = require('../../services/storage');

/** Flattens nested objects into dotted $set paths so a partial update never wipes sibling fields. */
function toSetPaths(input, prefix = '') {
  const paths = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) Object.assign(paths, toSetPaths(value, path));
    else paths[path] = value;
  }
  return paths;
}

async function getBusiness(ctx) {
  const settings = await BusinessSetting.findOne({ organizationId: ctx.organizationId }).lean();
  if (!settings) throw ApiError.notFound('Business settings');
  return settings;
}

async function updateBusiness(ctx, input) {
  const before = await getBusiness(ctx);
  const updated = await BusinessSetting.findOneAndUpdate(
    { organizationId: ctx.organizationId },
    { $set: { ...toSetPaths(input), updatedBy: ctx.userId } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  invalidateSettings(ctx.organizationId);
  await recordAudit(ctx, { action: 'settings.business_updated', entity: { kind: 'settings', label: 'Business settings' }, summary: 'Updated business settings', before, after: updated });
  return updated;
}

async function updateLogo(ctx, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload');
  const before = await getBusiness(ctx);
  const logo = await storage.saveFile(ctx.organizationId, file, { imagesOnly: true });
  const updated = await BusinessSetting.findOneAndUpdate(
    { organizationId: ctx.organizationId },
    { $set: { logo, updatedBy: ctx.userId } },
    { returnDocument: 'after' },
  ).lean();
  if (before.logo?.key) await storage.removeFile(before.logo.key);
  invalidateSettings(ctx.organizationId);
  await recordAudit(ctx, { action: 'settings.logo_updated', entity: { kind: 'settings', label: 'Business logo' }, summary: 'Changed the business logo' });
  return updated;
}

async function removeLogo(ctx) {
  const before = await getBusiness(ctx);
  const updated = await BusinessSetting.findOneAndUpdate(
    { organizationId: ctx.organizationId },
    { $unset: { logo: 1 }, $set: { updatedBy: ctx.userId } },
    { returnDocument: 'after' },
  ).lean();
  if (before.logo?.key) await storage.removeFile(before.logo.key);
  invalidateSettings(ctx.organizationId);
  return updated;
}

async function getSystem(ctx) {
  const settings = await SystemSetting.findOne({ organizationId: ctx.organizationId }).lean();
  if (!settings) throw ApiError.notFound('System settings');
  return settings;
}

async function updateSystem(ctx, input) {
  const before = await getSystem(ctx);
  const updated = await SystemSetting.findOneAndUpdate(
    { organizationId: ctx.organizationId },
    { $set: { ...toSetPaths(input), updatedBy: ctx.userId } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  invalidateSettings(ctx.organizationId);
  await recordAudit(ctx, { action: 'settings.system_updated', entity: { kind: 'settings', label: 'System settings' }, summary: 'Updated system settings', before, after: updated });
  return updated;
}

module.exports = { getBusiness, updateBusiness, updateLogo, removeLogo, getSystem, updateSystem, toSetPaths };
