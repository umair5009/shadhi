// Test harness: real Express app + real MongoDB (in-memory mongod), driven over HTTP with supertest.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-definitely-long-enough-1234567890';
process.env.MONGODB_URI = 'mongodb://placeholder-replaced-at-runtime';
process.env.LOG_REQUESTS = 'false';
process.env.SCHEDULER_ENABLED = 'false';
process.env.EMAIL_PROVIDER = 'none';

const http = require('node:http');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const models = require('../src/models');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const { createApp } = require('../src/app');
const { createOrganization } = require('../src/modules/organizations/organization.service');
const { invalidateSettings } = require('../src/services/settings');
const bcrypt = require('bcryptjs');

let mongo;
let server;

/** Real HTTP server on a random port, shared by all requests in a test file. */
async function startTestServer() {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function stopTestServer() {
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
  await mongo?.stop();
}

async function resetDatabase() {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
}

const OWNER = { name: 'Owner Admin', email: 'owner@test.pk', password: 'Owner@12345' };

/** Creates an organization and returns a supertest agent signed in as its Super Admin. */
async function createOrgWithOwner(name = 'Test Hall') {
  const result = await createOrganization({ name, owner: { ...OWNER, email: `owner.${Date.now()}.${Math.random().toString(36).slice(2)}@test.pk` } });
  invalidateSettings(result.organization._id);
  const agent = request.agent(server);
  const response = await agent.post('/api/auth/login').send({ email: result.owner.email, password: OWNER.password });
  if (response.status !== 200) throw new Error(`owner login failed: ${JSON.stringify(response.body)}`);
  return { ...result, agent, organizationId: result.organization._id };
}

/** Adds a user with one of the default roles and returns a signed-in agent for them. */
async function createUserWithRole(organizationId, roleKey, password = 'Staff@12345') {
  const role = await models.Role.findOne({ organizationId, key: roleKey });
  const email = `${roleKey}.${Date.now()}.${Math.random().toString(36).slice(2)}@test.pk`;
  const user = await models.User.create({
    organizationId,
    name: `${roleKey} user`,
    email,
    role: role._id,
    passwordHash: await bcrypt.hash(password, 4),
  });
  const agent = request.agent(server);
  const response = await agent.post('/api/auth/login').send({ email, password });
  if (response.status !== 200) throw new Error(`login failed: ${JSON.stringify(response.body)}`);
  return { user, agent, email, password };
}

function getApp() {
  return server;
}

module.exports = { startTestServer, stopTestServer, resetDatabase, createOrgWithOwner, createUserWithRole, getApp, request, models, OWNER };
