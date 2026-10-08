const env = require('./src/config/env');
require('./src/models');
const { connectDatabase, disconnectDatabase } = require('./src/config/db');
const { createApp } = require('./src/app');
const { startScheduler } = require('./src/jobs/scheduler');

async function start() {
  await connectDatabase(env.MONGODB_URI);
  console.log('[db] connected');

  const app = createApp();
  const server = app.listen(env.PORT, () => console.log(`[api] listening on http://localhost:${env.PORT}`));
  const stopScheduler = env.SCHEDULER_ENABLED ? startScheduler() : () => {};

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    stopScheduler();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('[api] failed to start:', error.message);
  process.exit(1);
});
