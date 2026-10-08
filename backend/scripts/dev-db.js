// Runs a local MongoDB for development without Docker or a system-wide install.
// Uses the official mongod binary downloaded by mongodb-memory-server and keeps data in backend/.data/db,
// so it survives restarts. Stop with Ctrl+C.
//
// If you already run MongoDB (local install or Atlas), you don't need this — just point MONGODB_URI at it.

const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');

const port = Number(process.env.DEV_DB_PORT ?? 27017);
const dbPath = path.resolve(__dirname, '../.data/db');

async function main() {
  fs.mkdirSync(dbPath, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { port, dbPath, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  });
  console.log(`[dev-db] MongoDB running at ${server.getUri()}`);
  console.log(`[dev-db] data directory: ${dbPath}`);
  console.log('[dev-db] press Ctrl+C to stop');

  const stop = async () => {
    await server.stop({ doCleanup: false, force: false });
    console.log('\n[dev-db] stopped (data kept)');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('[dev-db] could not start MongoDB:', error.message);
  if (/EADDRINUSE|already in use/i.test(error.message)) console.error(`Port ${port} is busy — is MongoDB already running? Set DEV_DB_PORT to use another port.`);
  process.exit(1);
});
