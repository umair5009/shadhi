const mongoose = require('mongoose');

mongoose.set('strictQuery', true);
mongoose.set('toJSON', { versionKey: false });
mongoose.set('toObject', { versionKey: false });

async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // Build indexes up front so unique constraints (invoice numbers, phone numbers…) are in force
  // before the first request is served.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
