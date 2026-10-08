const cron = require('node-cron');
const { Organization } = require('../models');
const { getSystemSettings } = require('../services/settings');
const { autoCompleteFinishedEvents } = require('../modules/bookings/bookings.service');

/** Marks finished events as completed for every organization that has the setting switched on. */
async function completeFinishedEvents() {
  const organizations = await Organization.find({ isActive: true }).select('_id').lean();
  for (const { _id } of organizations) {
    try {
      const settings = await getSystemSettings(_id);
      if (!settings.booking?.autoCompleteEvents) continue;
      const completed = await autoCompleteFinishedEvents(_id);
      if (completed) console.log(`[jobs] marked ${completed} finished event(s) as completed for ${_id}`);
    } catch (error) {
      console.error(`[jobs] auto-complete failed for ${_id}:`, error.message);
    }
  }
}

/** Starts recurring jobs. The job is idempotent, so running it on several API instances is harmless. */
function startScheduler() {
  const tasks = [cron.schedule('*/30 * * * *', completeFinishedEvents, { name: 'complete-finished-events', noOverlap: true })];
  // Catch up once shortly after boot.
  setTimeout(() => completeFinishedEvents().catch((error) => console.error('[jobs]', error.message)), 5000).unref();
  return () => tasks.forEach((task) => task.stop());
}

module.exports = { startScheduler, completeFinishedEvents };
