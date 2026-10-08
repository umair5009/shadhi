const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

/** Hall, customer, dishes and a Gold package created through the API. */
async function fixtures(agent) {
  const hall = (await agent.post('/api/halls').send({ name: 'Grand Hall', capacity: 500, basePrice: 200000, facilities: ['ac', 'stage'] })).body.data;
  const hall2 = (await agent.post('/api/halls').send({ name: 'Garden Marquee', capacity: 800, basePrice: 250000 })).body.data;
  const customer = (await agent.post('/api/customers').send({ fullName: 'Ahmed Raza', phone: '0300-1234567', city: 'Lahore' })).body.data;
  const category = (await agent.post('/api/menu/categories').send({ name: 'Main Course' })).body.data;
  const karahi = (await agent.post('/api/menu/items').send({ name: 'Chicken Karahi', category: category._id, price: 800 })).body.data;
  const qorma = (await agent.post('/api/menu/items').send({ name: 'Mutton Qorma', category: category._id, price: 1200 })).body.data;
  const kheer = (await agent.post('/api/menu/items').send({ name: 'Kheer', category: category._id, price: 250 })).body.data;
  const gold = (
    await agent.post('/api/menu/packages').send({
      name: 'Gold',
      pricingType: 'per_person',
      price: 2500,
      items: [
        { menuItem: karahi._id },
        { menuItem: qorma._id },
        { menuItem: kheer._id, isOptional: true, extraPrice: 150 },
      ],
    })
  ).body.data;
  return { hall, hall2, customer, karahi, qorma, kheer, gold };
}

function bookingBody(fx, overrides = {}) {
  return {
    customer: fx.customer._id,
    hall: fx.hall._id,
    eventType: 'baraat',
    eventDate: '2027-03-12',
    startTime: '19:00',
    endTime: '23:00',
    guestCount: 300,
    status: 'confirmed',
    ...overrides,
  };
}

describe('halls and customers', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('prevents duplicate customer phones regardless of formatting', async () => {
    const { agent } = await h.createOrgWithOwner();
    await agent.post('/api/customers').send({ fullName: 'Sana', phone: '0321 7654321' }).expect(201);
    const duplicate = await agent.post('/api/customers').send({ fullName: 'Sana B', phone: '+92 321 7654321' });
    assert.equal(duplicate.status, 409);
    assert.ok(duplicate.body.error.details[0].existingCustomerId);
  });

  it('finds customers by partial phone and name', async () => {
    const { agent } = await h.createOrgWithOwner();
    await agent.post('/api/customers').send({ fullName: 'Zainab Tariq', phone: '0333-5550001' });
    await agent.post('/api/customers').send({ fullName: 'Usman Ali', phone: '0345-1112223' });
    assert.equal((await agent.get('/api/customers/lookup?q=5550')).body.data[0].fullName, 'Zainab Tariq');
    assert.equal((await agent.get('/api/customers?q=usman')).body.meta.total, 1);
  });

  it('keeps tenants isolated', async () => {
    const a = await h.createOrgWithOwner('Hall A');
    const b = await h.createOrgWithOwner('Hall B');
    const customer = (await a.agent.post('/api/customers').send({ fullName: 'Private', phone: '0300-9999999' })).body.data;
    assert.equal((await b.agent.get(`/api/customers/${customer._id}`)).status, 404);
    assert.equal((await b.agent.get('/api/customers')).body.meta.total, 0);
    // Same phone is fine in another organization
    assert.equal((await b.agent.post('/api/customers').send({ fullName: 'Other', phone: '0300-9999999' })).status, 201);
  });
});

describe('bookings', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  it('computes totals on the server from package, services and charges', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const response = await agent.post('/api/bookings').send(
      bookingBody(fx, {
        menu: { mode: 'package', package: fx.gold._id, extras: [{ menuItem: fx.kheer._id }] },
        services: [{ name: 'Stage decor', quantity: 1, unitPrice: 50000 }],
        charges: { decoration: 30000, other: 5000, discount: 20000, taxRate: 5 },
        advancePayment: { amount: 300000, method: 'cash' },
      }),
    );
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const booking = response.body.data;
    // hall 200000 + menu (2500×300 + kheer 150×300) 795000 + decor 30000 + services 50000 + other 5000 = 1,080,000
    assert.equal(booking.totals.subtotal, 1080000);
    assert.equal(booking.totals.taxable, 1060000);
    assert.equal(booking.totals.tax, 53000);
    assert.equal(booking.totals.grandTotal, 1113000);
    assert.equal(booking.totals.netPaid, 300000);
    assert.equal(booking.totals.balance, 813000);
    assert.equal(booking.paymentStatus, 'partial');
    assert.match(booking.bookingNumber, /^BK-\d{4}-00001$/);
    assert.deepEqual(
      booking.menu.items.map((item) => [item.name, item.source]),
      [['Chicken Karahi', 'package'], ['Mutton Qorma', 'package'], ['Kheer', 'extra']],
    );
  });

  it('ignores totals sent by the client', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const response = await agent.post('/api/bookings').send({ ...bookingBody(fx), totals: { grandTotal: 1 } });
    assert.equal(response.body.data.totals.grandTotal, 200000);
  });

  it('handles events that run past midnight', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const booking = (await agent.post('/api/bookings').send(bookingBody(fx, { startTime: '20:00', endTime: '01:00' }))).body.data;
    // Asia/Karachi is UTC+5: 20:00 → 15:00Z, 01:00 next day → 20:00Z
    assert.equal(booking.startAt, '2027-03-12T15:00:00.000Z');
    assert.equal(booking.endAt, '2027-03-12T20:00:00.000Z');
  });

  it('prevents double booking of confirmed events, including the setup buffer', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    await agent.post('/api/bookings').send(bookingBody(fx)).expect(201);

    const overlap = await agent.post('/api/bookings').send(bookingBody(fx, { startTime: '22:00', endTime: '02:00' }));
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, 'BOOKING_CONFLICT');

    // Default buffer is 60 minutes: starting at 23:30 is too close, 00:00 is fine.
    assert.equal((await agent.post('/api/bookings').send(bookingBody(fx, { startTime: '23:30', endTime: '02:00' }))).status, 409);
    assert.equal((await agent.post('/api/bookings').send(bookingBody(fx, { startTime: '00:00', endTime: '02:00', eventDate: '2027-03-13' }))).status, 201);

    // Another hall at the same time is fine.
    assert.equal((await agent.post('/api/bookings').send(bookingBody(fx, { hall: fx.hall2._id }))).status, 201);
  });

  it('allows tentative holds with a warning but blocks confirming them over a confirmed event', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    await agent.post('/api/bookings').send(bookingBody(fx)).expect(201);
    const hold = await agent.post('/api/bookings').send(bookingBody(fx, { status: 'tentative' }));
    assert.equal(hold.status, 201);
    assert.ok(hold.body.meta.warnings.some((warning) => /cannot be confirmed/.test(warning)));

    const confirm = await agent.post(`/api/bookings/${hold.body.data._id}/status`).send({ status: 'confirmed' });
    assert.equal(confirm.status, 409);
  });

  it('never stores two confirmed bookings when requests race', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const results = await Promise.all(Array.from({ length: 6 }, () => agent.post('/api/bookings').send(bookingBody(fx))));
    const created = results.filter((response) => response.status === 201).length;
    assert.ok(created <= 1, `created ${created} overlapping confirmed bookings`);
    const confirmed = await h.models.Booking.countDocuments({ status: 'confirmed' });
    assert.ok(confirmed <= 1);
  });

  it('reports hall availability for a slot', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    await agent.post('/api/bookings').send(bookingBody(fx));
    const availability = (await agent.get('/api/halls/availability?date=2027-03-12&startTime=20:00&endTime=23:00')).body.data;
    const byName = Object.fromEntries(availability.map((entry) => [entry.hall.name, entry.status]));
    assert.deepEqual(byName, { 'Garden Marquee': 'available', 'Grand Hall': 'booked' });
  });

  it('follows the status workflow and keeps cancelled bookings', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const booking = (await agent.post('/api/bookings').send(bookingBody(fx, { status: 'inquiry' }))).body.data;

    assert.equal((await agent.post(`/api/bookings/${booking._id}/status`).send({ status: 'completed' })).status, 400);
    assert.equal((await agent.post(`/api/bookings/${booking._id}/status`).send({ status: 'cancelled' })).status, 422); // reason required
    const cancelled = await agent.post(`/api/bookings/${booking._id}/status`).send({ status: 'cancelled', reason: 'Family changed venue' });
    assert.equal(cancelled.body.data.status, 'cancelled');
    assert.equal(cancelled.body.data.cancellation.reason, 'Family changed venue');
    assert.equal(cancelled.body.data.statusHistory.length, 2);
    assert.equal((await agent.patch(`/api/bookings/${booking._id}`).send({ guestCount: 10 })).status, 400);
    assert.equal((await agent.get(`/api/bookings?status=cancelled`)).body.meta.total, 1);
  });

  it('keeps the agreed package snapshot when the package changes later', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const booking = (await agent.post('/api/bookings').send(bookingBody(fx, { menu: { mode: 'package', package: fx.gold._id } }))).body.data;
    await agent.patch(`/api/menu/packages/${fx.gold._id}`).send({ price: 3000, items: [{ menuItem: fx.karahi._id }] });

    const edited = (await agent.patch(`/api/bookings/${booking._id}`).send({ guestCount: 350, menu: { mode: 'package', package: fx.gold._id } })).body.data;
    assert.equal(edited.menu.package.rate, 2500);
    assert.equal(edited.menu.items.length, 2);
    assert.equal(edited.totals.menu, 2500 * 350);
  });

  it('rejects a discount larger than the subtotal', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const response = await agent.post('/api/bookings').send(bookingBody(fx, { charges: { hall: 100000, discount: 150000 } }));
    assert.equal(response.status, 422);
    assert.equal(response.body.error.details[0].field, 'charges.discount');
  });

  it('only lets receptionists save inquiries and tentative bookings', async () => {
    const { agent, organizationId } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const receptionist = await h.createUserWithRole(organizationId, 'receptionist');
    assert.equal((await receptionist.agent.post('/api/bookings').send(bookingBody(fx))).status, 403);
    assert.equal((await receptionist.agent.post('/api/bookings').send(bookingBody(fx, { status: 'tentative' }))).status, 201);
  });

  it('returns calendar events in a date range', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    await agent.post('/api/bookings').send(bookingBody(fx));
    await agent.post('/api/bookings').send(bookingBody(fx, { eventDate: '2027-04-02' }));
    const march = (await agent.get('/api/bookings/calendar?from=2027-03-01&to=2027-03-31')).body.data;
    assert.equal(march.length, 1);
    assert.equal(march[0].hall.name, 'Grand Hall');
    assert.equal((await agent.get('/api/bookings/calendar?from=2027-01-01&to=2027-06-30')).status, 422);
  });
});

describe('payments and invoices', () => {
  before(h.startTestServer);
  after(h.stopTestServer);
  beforeEach(h.resetDatabase);

  async function confirmedBooking(agent) {
    const fx = await fixtures(agent);
    const booking = (await agent.post('/api/bookings').send(bookingBody(fx, { charges: { hall: 100000 } }))).body.data;
    return { fx, booking };
  }

  it('records payments, updates the balance and refuses overpayment', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    const first = await agent.post('/api/payments').send({ booking: booking._id, amount: 40000, method: 'cash' });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.type, 'advance');
    assert.match(first.body.data.receiptNumber, /^RCP-\d{4}-00001$/);

    const tooMuch = await agent.post('/api/payments').send({ booking: booking._id, amount: 60001, method: 'cash' });
    assert.equal(tooMuch.status, 422);
    assert.match(tooMuch.body.error.message, /remaining balance of Rs\. 60,000/);

    const last = await agent.post('/api/payments').send({ booking: booking._id, amount: 60000, method: 'bank_transfer', reference: 'TX-1' });
    assert.equal(last.body.data.type, 'final');
    const updated = (await agent.get(`/api/bookings/${booking._id}`)).body.data;
    assert.equal(updated.totals.balance, 0);
    assert.equal(updated.paymentStatus, 'paid');
  });

  it('never lets concurrent payments exceed the total', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => agent.post('/api/payments').send({ booking: booking._id, amount: 30000, method: 'cash' })),
    );
    assert.equal(results.filter((response) => response.status === 201).length, 3);
    const updated = (await agent.get(`/api/bookings/${booking._id}`)).body.data;
    assert.equal(updated.totals.netPaid, 90000);
    assert.equal(updated.totals.balance, 10000);
  });

  it('refunds, voids and recomputes from the ledger', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    const payment = (await agent.post('/api/payments').send({ booking: booking._id, amount: 50000, method: 'cash' })).body.data;

    assert.equal((await agent.post('/api/payments/refunds').send({ booking: booking._id, amount: 60000, method: 'cash', notes: 'x' })).status, 422);
    const refund = await agent.post('/api/payments/refunds').send({ booking: booking._id, amount: 10000, method: 'cash', notes: 'Guests reduced' });
    assert.equal(refund.status, 201);
    let current = (await agent.get(`/api/bookings/${booking._id}`)).body.data;
    assert.equal(current.totals.netPaid, 40000);

    const voided = await agent.post(`/api/payments/${payment._id}/void`).send({ reason: 'Entered on wrong booking' });
    assert.equal(voided.body.data.void.reason, 'Entered on wrong booking');
    assert.equal((await agent.post(`/api/payments/${payment._id}/void`).send({ reason: 'again' })).status, 400);
    current = (await agent.get(`/api/bookings/${booking._id}`)).body.data;
    assert.equal(current.totals.paid, 0);
    assert.equal(current.totals.refunded, 10000);

    const list = await agent.get(`/api/payments?booking=${booking._id}`);
    assert.equal(list.body.meta.total, 1); // voided hidden by default
    assert.equal(list.body.summary.refunded, 10000);
    assert.equal((await agent.get(`/api/payments?booking=${booking._id}&includeVoided=true`)).body.meta.total, 2);
  });

  it('does not allow editing a payment or reducing a total below what was paid', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    const payment = (await agent.post('/api/payments').send({ booking: booking._id, amount: 80000, method: 'cash' })).body.data;
    await assert.rejects(h.models.Payment.updateOne({ _id: payment._id }, { amount: 1 }), /cannot be changed/);
    await assert.rejects(h.models.Payment.deleteOne({ _id: payment._id }), /cannot be deleted/);
    const shrink = await agent.patch(`/api/bookings/${booking._id}`).send({ charges: { discount: 30000 } });
    assert.equal(shrink.status, 422);
  });

  it('blocks payments on cancelled bookings but allows refunds', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    await agent.post('/api/payments').send({ booking: booking._id, amount: 20000, method: 'cash' });
    await agent.post(`/api/bookings/${booking._id}/status`).send({ status: 'cancelled', reason: 'Postponed' });
    assert.equal((await agent.post('/api/payments').send({ booking: booking._id, amount: 1000, method: 'cash' })).status, 409);
    assert.equal((await agent.post('/api/payments/refunds').send({ booking: booking._id, amount: 20000, method: 'cash', notes: 'Full refund' })).status, 201);
  });

  it('issues uniquely numbered invoices, even concurrently', async () => {
    const { agent } = await h.createOrgWithOwner();
    const fx = await fixtures(agent);
    const bookings = [];
    for (let day = 1; day <= 6; day += 1) {
      bookings.push((await agent.post('/api/bookings').send(bookingBody(fx, { eventDate: `2027-05-${String(day).padStart(2, '0')}` }))).body.data);
    }
    const invoices = await Promise.all(bookings.map((booking) => agent.post('/api/invoices').send({ booking: booking._id })));
    const numbers = invoices.map((response) => response.body.data.invoiceNumber);
    assert.equal(new Set(numbers).size, 6);
    assert.ok(numbers.every((number) => /^INV-\d{4}-0000[1-6]$/.test(number)));
  });

  it('respects the configured starting number and replaces invoices explicitly', async () => {
    const { agent } = await h.createOrgWithOwner();
    await agent.put('/api/settings/business').send({ name: 'Test Hall', invoice: { startingNumber: 250 } });
    const { booking } = await confirmedBooking(agent);
    const first = (await agent.post('/api/invoices').send({ booking: booking._id })).body.data;
    assert.match(first.invoiceNumber, /-00250$/);
    assert.equal((await agent.post('/api/invoices').send({ booking: booking._id })).status, 409);

    // The guest count is printed on the invoice, so changing it makes the invoice out of date.
    await agent.patch(`/api/bookings/${booking._id}`).send({ guestCount: 320 });
    assert.equal((await agent.get(`/api/invoices/${first._id}`)).body.data.isOutdated, true);
  });

  it('flags outdated invoices and renders PDFs', async () => {
    const { agent } = await h.createOrgWithOwner();
    const { booking } = await confirmedBooking(agent);
    await agent.post('/api/payments').send({ booking: booking._id, amount: 25000, method: 'jazzcash' });
    const invoice = (await agent.post('/api/invoices').send({ booking: booking._id })).body.data;
    assert.equal(invoice.snapshot.lines[0].description, 'Hall booking — Grand Hall');
    assert.equal(invoice.payments.length, 1);

    await agent.patch(`/api/bookings/${booking._id}`).send({ charges: { decoration: 15000 } });
    assert.equal((await agent.get(`/api/invoices/${invoice._id}`)).body.data.isOutdated, true);

    const replaced = (await agent.post('/api/invoices').send({ booking: booking._id, replace: true })).body.data;
    const old = (await agent.get(`/api/invoices/${invoice._id}`)).body.data;
    assert.equal(old.status, 'void');
    assert.equal(old.supersededBy.invoiceNumber, replaced.invoiceNumber);

    const pdf = await agent.get(`/api/invoices/${replaced._id}/pdf`).buffer(true).parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

    const payments = (await agent.get(`/api/payments?booking=${booking._id}`)).body.data;
    const receipt = await agent.get(`/api/payments/${payments[0]._id}/receipt.pdf`);
    assert.equal(receipt.status, 200);
  });
});
