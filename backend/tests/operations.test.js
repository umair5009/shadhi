const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { todayInTimeZone, formatDateOnly, addDays } = require('../src/utils/dates');

const today = () => formatDateOnly(todayInTimeZone('Asia/Karachi'));
const daysFromToday = (days) => formatDateOnly(addDays(todayInTimeZone('Asia/Karachi'), days));

async function categoryId(agent, key) {
  const categories = (await agent.get('/api/expenses/categories')).body.data;
  return categories.find((category) => category.key === key)._id;
}

async function eventWithPayment(agent, { eventDate = daysFromToday(-3), hallCharge = 500000, paid = 200000 } = {}) {
  const hall = (await agent.post('/api/halls').send({ name: `Hall ${Math.random().toString(36).slice(2, 7)}`, capacity: 400, basePrice: hallCharge })).body.data;
  const customer = (await agent.post('/api/customers').send({ fullName: 'Event Customer', phone: `0300${Math.floor(1000000 + Math.random() * 8999999)}` })).body.data;
  const booking = (
    await agent.post('/api/bookings').send({
      customer: customer._id,
      hall: hall._id,
      eventType: 'walima',
      eventDate,
      startTime: '12:00',
      endTime: '16:00',
      guestCount: 250,
      status: eventDate <= today() ? 'completed' : 'confirmed',
      ...(paid ? { advancePayment: { amount: paid, method: 'cash', paidOn: today() } } : {}),
    })
  ).body.data;
  return { hall, customer, booking };
}

describe('expenses and profitability', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('records expenses with an audit trail and voids instead of deleting', async () => {
    const { agent } = await h.createOrgWithOwner();
    const electricity = await categoryId(agent, 'electricity');
    const created = await agent.post('/api/expenses').send({ category: electricity, amount: 45000, date: today(), description: 'LESCO bill', vendor: 'LESCO' });
    assert.equal(created.status, 201);
    assert.match(created.body.data.expenseNumber, /^EXP-\d{4}-00001$/);

    const edited = await agent.patch(`/api/expenses/${created.body.data._id}`).send({ amount: 47500 });
    assert.equal(edited.body.data.amount, 47500);
    const history = edited.body.data.history;
    assert.equal(history[0].action, 'expense.updated');
    assert.equal(history[0].changes.before.amount, 45000);
    assert.equal(history[0].changes.after.amount, 47500);

    const voided = await agent.post(`/api/expenses/${created.body.data._id}/void`).send({ reason: 'Duplicate entry' });
    assert.equal(voided.body.data.void.reason, 'Duplicate entry');
    assert.equal((await agent.patch(`/api/expenses/${created.body.data._id}`).send({ amount: 1 })).status, 400);
    assert.equal((await agent.get('/api/expenses')).body.summary.total, 0);
    assert.equal((await agent.get('/api/expenses?includeVoided=true')).body.meta.total, 1);
  });

  it('calculates event profit from linked expenses', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await eventWithPayment(agent);
    const food = await categoryId(agent, 'food');
    const decoration = await categoryId(agent, 'decoration');
    await agent.post('/api/expenses').send({ category: food, amount: 150000, date: today(), description: 'Meat & rice', booking: booking._id });
    await agent.post('/api/expenses').send({ category: decoration, amount: 50000, date: today(), description: 'Flowers', booking: booking._id });

    const profit = (await agent.get(`/api/bookings/${booking._id}/profitability`)).body.data;
    assert.equal(profit.revenue, 500000);
    assert.equal(profit.totalExpenses, 200000);
    assert.equal(profit.profit, 300000);
    assert.equal(profit.margin, 60);
    assert.equal(profit.collected, 200000);
    assert.equal(profit.byCategory[0].name, 'Food');
  });

  it('hides event profit from roles without financial access', async () => {
    const { agent, organizationId } = await h.createOrgWithOwner();
    const { booking } = await eventWithPayment(agent);
    const receptionist = await h.createUserWithRole(organizationId, 'receptionist');
    assert.equal((await receptionist.agent.get(`/api/bookings/${booking._id}/profitability`)).status, 403);
  });
});

describe('inventory', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  async function rice(agent) {
    const supplier = (await agent.post('/api/inventory/suppliers').send({ name: 'Akbari Mandi', phone: '0321-1112223' })).body.data;
    const item = (
      await agent.post('/api/inventory/items').send({
        name: 'Basmati Rice',
        kind: 'food',
        category: 'Rice',
        sku: 'rice-001',
        unit: 'kg',
        minimumQuantity: 50,
        costPerUnit: 300,
        supplier: supplier._id,
        openingQuantity: 120,
      })
    ).body.data;
    return { supplier, item };
  }

  it('tracks stock through purchases, usage and counts', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { item } = await rice(agent);
    assert.equal(item.sku, 'RICE-001');
    assert.equal(item.currentQuantity, 120);

    const purchase = await agent.post('/api/inventory/transactions').send({ item: item._id, type: 'purchase', quantity: 80, unitCost: 320 });
    assert.equal(purchase.status, 201);
    assert.equal(purchase.body.data.balanceAfter, 200);
    assert.ok(purchase.body.data.expense, 'purchase posted an expense');

    const expenses = (await agent.get('/api/expenses?source=inventory_purchase')).body;
    assert.equal(expenses.summary.total, 25600);
    assert.equal(expenses.data[0].vendor, 'Akbari Mandi');

    await agent.post('/api/inventory/transactions').send({ item: item._id, type: 'stock_out', quantity: 170 }).expect(201);
    const tooMuch = await agent.post('/api/inventory/transactions').send({ item: item._id, type: 'stock_out', quantity: 31 });
    assert.equal(tooMuch.status, 422);
    assert.match(tooMuch.body.error.message, /Only 30 kg/);

    const count = await agent.post('/api/inventory/transactions').send({ item: item._id, type: 'adjustment', quantity: 28, notes: 'Monthly count' });
    assert.equal(count.body.data.quantityChange, -2);

    const detail = (await agent.get(`/api/inventory/items/${item._id}`)).body.data;
    assert.equal(detail.currentQuantity, 28);
    assert.equal(detail.stockStatus, 'low_stock');
    assert.equal(detail.costPerUnit, 320);

    const reconcile = (await agent.post(`/api/inventory/items/${item._id}/reconcile`)).body.data;
    assert.deepEqual(reconcile, { ledger: 28, cached: 28, fixed: false });
  });

  it('never goes negative under concurrent stock-outs', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { item } = await rice(agent);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => agent.post('/api/inventory/transactions').send({ item: item._id, type: 'stock_out', quantity: 25 })),
    );
    assert.equal(results.filter((response) => response.status === 201).length, 4);
    assert.equal((await agent.get(`/api/inventory/items/${item._id}`)).body.data.currentQuantity, 20);
  });

  it('filters low stock items and blocks deleting items with history', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { item } = await rice(agent);
    await agent.post('/api/inventory/items').send({ name: 'Chairs', kind: 'equipment', category: 'Furniture', sku: 'CHR-1', unit: 'piece', minimumQuantity: 100, openingQuantity: 600 });
    await agent.post('/api/inventory/transactions').send({ item: item._id, type: 'damaged', quantity: 80, notes: 'Water damage' });
    const low = (await agent.get('/api/inventory/items?stockStatus=low_stock')).body;
    assert.deepEqual(low.data.map((entry) => entry.name), ['Basmati Rice']);
    assert.equal(low.summary.lowStock, 1);
    assert.equal((await agent.delete(`/api/inventory/items/${item._id}`)).status, 409);
  });
});

describe('staff', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('marks attendance and pays salaries into expenses', async () => {
    const { agent } = await h.createOrgWithOwner();
    const chef = (await agent.post('/api/staff').send({ name: 'Ustad Nazir', position: 'chef', salary: 60000, joiningDate: '2024-01-01', phone: '0300-7770001' })).body.data;
    const waiter = (await agent.post('/api/staff').send({ name: 'Imran', position: 'waiter', salary: 30000, joiningDate: '2025-03-10' })).body.data;
    assert.equal(chef.employeeCode, 'EMP-0001');

    const date = today();
    const sheet = await agent.put('/api/staff/attendance').send({
      date,
      entries: [
        { staff: chef._id, status: 'present', checkIn: '09:00' },
        { staff: waiter._id, status: 'late', checkIn: '10:15' },
      ],
    });
    assert.equal(sheet.body.data.counts.present, 1);
    assert.equal(sheet.body.data.counts.late, 1);
    // Re-marking the same day updates rather than duplicates.
    await agent.put('/api/staff/attendance').send({ date, entries: [{ staff: waiter._id, status: 'absent' }] });
    const month = date.slice(0, 7);
    const summary = (await agent.get(`/api/staff/attendance/summary?month=${month}`)).body.data;
    const waiterRow = summary.rows.find((row) => row.staff.name === 'Imran');
    assert.equal(waiterRow.counts.absent, 1);
    assert.equal(waiterRow.counts.late, 0);

    const paid = await agent.post('/api/staff/salaries').send({ staff: chef._id, period: month, grossAmount: 60000, bonus: 5000, deductions: 2000 });
    assert.equal(paid.status, 201);
    assert.equal(paid.body.data.netAmount, 63000);

    const payroll = (await agent.get(`/api/staff/salaries/summary?period=${month}`)).body.data;
    const chefRow = payroll.rows.find((row) => row.staff.name === 'Ustad Nazir');
    assert.equal(chefRow.remaining, 0);
    assert.equal(payroll.totals.remaining, 30000);

    const salaryExpenses = (await agent.get('/api/expenses?source=salary')).body;
    assert.equal(salaryExpenses.summary.total, 63000);
    assert.equal((await agent.patch(`/api/expenses/${salaryExpenses.data[0]._id}`).send({ amount: 1 })).status, 400);

    await agent.post(`/api/staff/salaries/${paid.body.data._id}/void`).send({ reason: 'Paid twice' }).expect(200);
    assert.equal((await agent.get('/api/expenses?source=salary')).body.summary.total, 0);
  });
});

describe('dashboard and reports', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('shows real figures on the dashboard', async () => {
    const { agent } = await h.createOrgWithOwner();
    await eventWithPayment(agent, { eventDate: daysFromToday(-2), paid: 200000 });
    const { booking: upcoming } = await eventWithPayment(agent, { eventDate: daysFromToday(10), paid: 100000 });
    const gas = await categoryId(agent, 'gas');
    await agent.post('/api/expenses').send({ category: gas, amount: 30000, date: today(), description: 'SNGPL' });

    const dashboard = (await agent.get('/api/dashboard?period=month')).body.data;
    assert.equal(dashboard.financials.revenue.amount, 300000);
    assert.equal(dashboard.financials.expenses.amount, 30000);
    assert.equal(dashboard.financials.profit.amount, 270000);
    assert.equal(dashboard.financials.pending.amount, 700000);
    assert.equal(dashboard.financials.pending.overdueAmount, 300000);
    assert.equal(dashboard.bookings.upcoming, 1);
    assert.equal(dashboard.upcomingEvents[0]._id, upcoming._id);
    assert.equal(dashboard.charts.monthly.length, 12);
    assert.ok(dashboard.recentActivity.some((entry) => entry.action === 'payment.received'));
  });

  it('hides money from roles without dashboard.financials', async () => {
    const { agent, organizationId, roles } = await h.createOrgWithOwner();
    await eventWithPayment(agent, { eventDate: daysFromToday(5) });
    const receptionistRole = roles.find((role) => role.key === 'receptionist');
    await agent.patch(`/api/roles/${receptionistRole._id}`).send({ permissions: [...receptionistRole.permissions, 'dashboard.view'] });
    const receptionist = await h.createUserWithRole(organizationId, 'receptionist');
    const dashboard = (await receptionist.agent.get('/api/dashboard')).body.data;
    assert.equal(dashboard.financials, null);
    assert.equal(dashboard.upcomingEvents[0].totals, undefined);
    assert.ok(!dashboard.recentActivity.some((entry) => entry.action.startsWith('payment.')));
  });

  it('builds every report and exports CSV and PDF', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await eventWithPayment(agent, { eventDate: daysFromToday(-1) });
    const food = await categoryId(agent, 'food');
    await agent.post('/api/expenses').send({ category: food, amount: 120000, date: today(), description: 'Catering', booking: booking._id });
    const from = daysFromToday(-40);
    const to = daysFromToday(40);

    const financial = (await agent.get(`/api/reports/financial?from=${from}&to=${to}`)).body.data;
    assert.equal(financial.summary.revenue, 200000);
    assert.equal(financial.summary.profit, 80000);

    const events = (await agent.get(`/api/reports/events?from=${from}&to=${to}`)).body.data;
    assert.equal(events.totals.profit, 380000);

    const bookings = (await agent.get(`/api/reports/bookings?from=${from}&to=${to}`)).body.data;
    assert.equal(bookings.halls[0].bookedDays, 1);

    const outstanding = (await agent.get('/api/reports/outstanding')).body.data;
    assert.equal(outstanding.totals.amount, 300000);
    assert.equal(outstanding.bookings[0].daysOverdue, 1);

    for (const report of ['customers', 'inventory']) assert.equal((await agent.get(`/api/reports/${report}?from=${from}&to=${to}`)).status, 200);

    const csv = await agent.get(`/api/reports/events?from=${from}&to=${to}&format=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.text, /Booking,Customer/);
    assert.match(csv.text, /500000/);

    for (const report of ['financial', 'bookings', 'customers', 'events', 'inventory', 'outstanding']) {
      const pdf = await agent.get(`/api/reports/${report}?from=${from}&to=${to}&format=pdf`).buffer(true).parse((res, done) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      assert.equal(pdf.status, 200, `${report} pdf`);
      assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
    }
  });

  it('requires export permission for downloads', async () => {
    const { agent, organizationId, roles } = await h.createOrgWithOwner();
    const accountant = roles.find((role) => role.key === 'accountant');
    await agent.patch(`/api/roles/${accountant._id}`).send({ permissions: accountant.permissions.filter((permission) => permission !== 'reports.export') });
    const user = await h.createUserWithRole(organizationId, 'accountant');
    assert.equal((await user.agent.get('/api/reports/financial')).status, 200);
    assert.equal((await user.agent.get('/api/reports/financial?format=csv')).status, 403);
  });
});
