const { BusinessSetting, SystemSetting } = require('../models');

// Settings are read on almost every booking/payment request, so they are cached briefly per organization.
// The cache is cleared on every settings update; the TTL bounds staleness across multiple server instances.
const TTL_MS = 30 * 1000;
const cache = new Map();

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  return value;
}

function getBusinessSettings(organizationId) {
  return cached(`business:${organizationId}`, async () => {
    const settings = await BusinessSetting.findOne({ organizationId }).lean();
    if (!settings) throw new Error(`Business settings missing for organization ${organizationId}`);
    return settings;
  });
}

function getSystemSettings(organizationId) {
  return cached(`system:${organizationId}`, async () => {
    const settings = await SystemSetting.findOne({ organizationId }).lean();
    if (!settings) throw new Error(`System settings missing for organization ${organizationId}`);
    return settings;
  });
}

function invalidateSettings(organizationId) {
  cache.delete(`business:${organizationId}`);
  cache.delete(`system:${organizationId}`);
}

module.exports = { getBusinessSettings, getSystemSettings, invalidateSettings };
