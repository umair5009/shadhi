const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { hashToken } = require('../src/services/tokens');

describe('authentication', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('logs in, returns the profile with permissions and sets httpOnly cookies', async () => {
    const { owner } = await h.createOrgWithOwner();
    const response = await h.request(h.getApp()).post('/api/auth/login').send({ email: owner.email, password: h.OWNER.password });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.user.email, owner.email);
    assert.ok(response.body.data.user.permissions.includes('users.manage'));
    assert.equal(response.body.data.organization.currency.code, 'PKR');
    const cookies = response.headers['set-cookie'].join(';');
    assert.match(cookies, /sh_access=.*HttpOnly/);
    assert.match(cookies, /sh_refresh=.*Path=\/api\/auth.*HttpOnly/);
    assert.ok(!JSON.stringify(response.body).includes('passwordHash'));
  });

  it('rejects wrong passwords with a generic message', async () => {
    const { owner } = await h.createOrgWithOwner();
    const wrong = await h.request(h.getApp()).post('/api/auth/login').send({ email: owner.email, password: 'nope-nope-1' });
    const unknown = await h.request(h.getApp()).post('/api/auth/login').send({ email: 'ghost@test.pk', password: 'nope-nope-1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it('requires a session for protected routes', async () => {
    const response = await h.request(h.getApp()).get('/api/auth/me');
    assert.equal(response.status, 401);
  });

  it('rotates the refresh token and logs out', async () => {
    const { agent } = await h.createOrgWithOwner();
    const refreshed = await agent.post('/api/auth/refresh');
    assert.equal(refreshed.status, 200);
    assert.match(refreshed.headers['set-cookie'].join(';'), /sh_refresh=/);
    assert.equal((await agent.get('/api/auth/me')).status, 200);

    await agent.post('/api/auth/logout');
    assert.equal((await agent.post('/api/auth/refresh')).status, 401);
  });

  it('changes password, keeps this device signed in and rejects the old password', async () => {
    const { agent, owner } = await h.createOrgWithOwner();
    const bad = await agent.post('/api/auth/change-password').send({ currentPassword: 'wrong-pass-1', newPassword: 'NewPass@123' });
    assert.equal(bad.status, 422);

    const ok = await agent.post('/api/auth/change-password').send({ currentPassword: h.OWNER.password, newPassword: 'NewPass@123' });
    assert.equal(ok.status, 200);
    assert.equal((await agent.get('/api/auth/me')).status, 200);

    const oldLogin = await h.request(h.getApp()).post('/api/auth/login').send({ email: owner.email, password: h.OWNER.password });
    assert.equal(oldLogin.status, 401);
    const newLogin = await h.request(h.getApp()).post('/api/auth/login').send({ email: owner.email, password: 'NewPass@123' });
    assert.equal(newLogin.status, 200);
  });

  it('resets a password with a valid single-use token', async () => {
    const { owner } = await h.createOrgWithOwner();
    const forgot = await h.request(h.getApp()).post('/api/auth/forgot-password').send({ email: owner.email });
    assert.equal(forgot.status, 200);
    const stored = await h.models.User.findById(owner._id).select('+resetTokenHash');
    assert.ok(stored.resetTokenHash, 'reset token hash is stored');

    // The raw token is only ever emailed, so plant a known one for the test.
    const token = 'a-known-reset-token-for-testing-purposes';
    await h.models.User.updateOne({ _id: owner._id }, { resetTokenHash: hashToken(token), resetTokenExpiresAt: new Date(Date.now() + 60000) });

    const reset = await h.request(h.getApp()).post('/api/auth/reset-password').send({ token, password: 'Fresh@12345' });
    assert.equal(reset.status, 200);
    const reuse = await h.request(h.getApp()).post('/api/auth/reset-password').send({ token, password: 'Other@12345' });
    assert.equal(reuse.status, 400);
    const login = await h.request(h.getApp()).post('/api/auth/login').send({ email: owner.email, password: 'Fresh@12345' });
    assert.equal(login.status, 200);
  });

  it('rejects weak passwords and invalid input with field errors', async () => {
    const response = await h.request(h.getApp()).post('/api/auth/reset-password').send({ token: 'x'.repeat(30), password: 'short' });
    assert.equal(response.status, 422);
    assert.equal(response.body.error.details[0].field, 'password');
  });

  it('rejects MongoDB operators in request bodies', async () => {
    const response = await h.request(h.getApp()).post('/api/auth/login').send({ email: { $gt: '' }, password: 'x' });
    assert.equal(response.status, 400);
  });
});

describe('users and roles', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('blocks users without users.manage', async () => {
    const { organizationId } = await h.createOrgWithOwner();
    const { agent } = await h.createUserWithRole(organizationId, 'receptionist');
    assert.equal((await agent.get('/api/users')).status, 403);
    assert.equal((await agent.put('/api/settings/business').send({ name: 'Hacked' })).status, 403);
  });

  it('creates a user, lists them and prevents duplicate emails', async () => {
    const { agent, roles } = await h.createOrgWithOwner();
    const manager = roles.find((role) => role.key === 'manager');
    const body = { name: 'Bilal Manager', email: 'bilal@test.pk', role: String(manager._id), password: 'Manager@123' };
    const created = await agent.post('/api/users').send(body);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.role.key, 'manager');
    const duplicate = await agent.post('/api/users').send(body);
    assert.equal(duplicate.status, 409);
    const list = await agent.get('/api/users?q=bilal');
    assert.equal(list.body.meta.total, 1);
  });

  it('keeps at least one active Super Admin and prevents self-deactivation', async () => {
    const { agent, owner, roles } = await h.createOrgWithOwner();
    const manager = roles.find((role) => role.key === 'manager');
    const self = await agent.patch(`/api/users/${owner._id}`).send({ isActive: false });
    assert.equal(self.status, 400);
    const selfRole = await agent.patch(`/api/users/${owner._id}`).send({ role: String(manager._id) });
    assert.equal(selfRole.status, 400);
  });

  it('prevents privilege escalation through custom roles', async () => {
    const { organizationId, agent: ownerAgent } = await h.createOrgWithOwner();
    // A role that can manage users and roles but nothing financial.
    const limited = await ownerAgent.post('/api/roles').send({ name: 'HR', permissions: ['users.manage', 'roles.manage', 'staff.view'] });
    assert.equal(limited.status, 201);
    const hrUser = await h.createUserWithRole(organizationId, limited.body.data.key);

    const grant = await hrUser.agent.patch(`/api/roles/${limited.body.data._id}`).send({ permissions: ['users.manage', 'roles.manage', 'staff.view', 'payments.void'] });
    assert.equal(grant.status, 403);

    const superAdmin = await h.models.Role.findOne({ organizationId, key: 'super_admin' });
    const promote = await hrUser.agent.patch(`/api/users/${hrUser.user._id}`).send({ role: String(superAdmin._id) });
    assert.equal(promote.status, 400); // cannot change own role

    const other = await h.createUserWithRole(organizationId, 'staff');
    const promoteOther = await hrUser.agent.patch(`/api/users/${other.user._id}`).send({ role: String(superAdmin._id) });
    assert.equal(promoteOther.status, 403);
  });

  it('applies permission changes immediately', async () => {
    const { organizationId, agent: ownerAgent } = await h.createOrgWithOwner();
    const { agent } = await h.createUserWithRole(organizationId, 'receptionist');
    assert.equal((await agent.get('/api/settings/business')).status, 403);
    const role = await h.models.Role.findOne({ organizationId, key: 'receptionist' });
    const updated = await ownerAgent.patch(`/api/roles/${role._id}`).send({ permissions: [...role.permissions, 'settings.view'] });
    assert.equal(updated.status, 200);
    assert.equal((await agent.get('/api/settings/business')).status, 200);
  });

  it('does not delete built-in roles or roles in use', async () => {
    const { agent, roles } = await h.createOrgWithOwner();
    const manager = roles.find((role) => role.key === 'manager');
    assert.equal((await agent.delete(`/api/roles/${manager._id}`)).status, 400);
    const custom = await agent.post('/api/roles').send({ name: 'Night Shift', permissions: ['bookings.view'] });
    assert.equal((await agent.delete(`/api/roles/${custom.body.data._id}`)).status, 204);
  });
});

describe('settings', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('partially updates business settings without wiping sibling fields', async () => {
    const { agent } = await h.createOrgWithOwner();
    await agent.put('/api/settings/business').send({ name: 'Royal Palace', invoice: { prefix: 'rp', footer: 'Shukriya' } });
    const response = await agent.put('/api/settings/business').send({ name: 'Royal Palace', invoice: { dueDays: 10 } });
    assert.equal(response.status, 200);
    assert.equal(response.body.data.invoice.prefix, 'RP');
    assert.equal(response.body.data.invoice.footer, 'Shukriya');
    assert.equal(response.body.data.invoice.dueDays, 10);
    assert.equal(response.body.data.currency.symbol, 'Rs.');
  });

  it('validates the timezone', async () => {
    const { agent } = await h.createOrgWithOwner();
    const bad = await agent.put('/api/settings/system').send({ timezone: 'Mars/Olympus' });
    assert.equal(bad.status, 422);
    const good = await agent.put('/api/settings/system').send({ booking: { bufferMinutes: 90 } });
    assert.equal(good.body.data.booking.bufferMinutes, 90);
    assert.equal(good.body.data.booking.defaultStartTime, '19:00');
  });
});
