// Aggregations behind the dashboard and reports. All figures come from live data.
//
// Definitions (kept consistent everywhere):
//   Revenue      money actually received in the period (payments − refunds, voided entries excluded) — "cash in"
//   Expenses     non-voided expenses dated in the period — "cash out"
//   Profit       Revenue − Expenses
//   Booked value grand total of non-cancelled events taking place in the period
//   Outstanding  balance still owed on non-cancelled bookings (not limited to a period)
//   Event profit event grand total − expenses linked to that event

const { Payment, Expense, Booking, Customer, Hall, InventoryItem, InventoryTransaction } = require('../../models');
const { MONEY_EPSILON, OPEN_BOOKING_STATUSES, BLOCKING_BOOKING_STATUSES, roundMoney } = require('../../config/shared');
const { addDays, daysBetween, formatDateOnly, zonedDateTimeToUtc } = require('../../utils/dates');

const notVoided = { void: { $exists: false } };

/** $lookup + $match that restricts payments/expenses to bookings in a given hall / of given event types. */
function bookingScopeStages({ hall, eventType, customer }) {
  if (!hall && !eventType?.length && !customer) return [];
  return [
    {
      $lookup: {
        from: 'bookings',
        localField: 'booking',
        foreignField: '_id',
        as: 'scopeBooking',
        pipeline: [{ $project: { hall: 1, eventType: 1, customer: 1 } }],
      },
    },
    { $unwind: '$scopeBooking' },
    {
      $match: {
        ...(hall ? { 'scopeBooking.hall': hall } : {}),
        ...(eventType?.length ? { 'scopeBooking.eventType': { $in: eventType } } : {}),
        ...(customer ? { 'scopeBooking.customer': customer } : {}),
      },
    },
  ];
}

function bookingMatch(organizationId, { from, to, hall, eventType, customer }) {
  return {
    organizationId,
    ...(from || to ? { eventDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}),
    ...(hall ? { hall } : {}),
    ...(eventType?.length ? { eventType: { $in: eventType } } : {}),
    ...(customer ? { customer } : {}),
  };
}

// ─── Money ───────────────────────────────────────────────────

async function revenueTotals(organizationId, { from, to, ...scope }) {
  const [row] = await Payment.aggregate([
    { $match: { organizationId, ...notVoided, paidOn: { $gte: from, $lte: to } } },
    ...bookingScopeStages(scope),
    {
      $group: {
        _id: null,
        received: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, 0, '$amount'] } },
        refunded: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, '$amount', 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const received = roundMoney(row?.received ?? 0);
  const refunded = roundMoney(row?.refunded ?? 0);
  return { received, refunded, net: roundMoney(received - refunded), count: row?.count ?? 0 };
}

async function revenueByMethod(organizationId, { from, to, ...scope }) {
  const rows = await Payment.aggregate([
    { $match: { organizationId, ...notVoided, paidOn: { $gte: from, $lte: to } } },
    ...bookingScopeStages(scope),
    { $group: { _id: '$method', net: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } }, count: { $sum: 1 } } },
    { $sort: { net: -1 } },
  ]);
  return rows.map((row) => ({ method: row._id, amount: roundMoney(row.net), count: row.count }));
}

async function expenseTotals(organizationId, { from, to, ...scope }) {
  const rows = await Expense.aggregate([
    { $match: { organizationId, ...notVoided, date: { $gte: from, $lte: to } } },
    ...bookingScopeStages(scope),
    { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'category' } },
    { $project: { _id: 0, categoryId: '$_id', name: { $ifNull: [{ $first: '$category.name' }, 'Other'] }, total: 1, count: 1 } },
    { $sort: { total: -1 } },
  ]);
  const total = roundMoney(rows.reduce((sum, row) => sum + row.total, 0));
  return { total, count: rows.reduce((sum, row) => sum + row.count, 0), byCategory: rows.map((row) => ({ ...row, total: roundMoney(row.total) })) };
}

/** Money still owed. `today` marks which balances are overdue (event already held). */
async function outstandingTotals(organizationId, today, scope = {}) {
  const [row] = await Booking.aggregate([
    { $match: { ...bookingMatch(organizationId, scope), status: { $ne: 'cancelled' }, 'totals.balance': { $gt: MONEY_EPSILON } } },
    {
      $group: {
        _id: null,
        amount: { $sum: '$totals.balance' },
        count: { $sum: 1 },
        overdueAmount: { $sum: { $cond: [{ $lt: ['$eventDate', today] }, '$totals.balance', 0] } },
        overdueCount: { $sum: { $cond: [{ $lt: ['$eventDate', today] }, 1, 0] } },
      },
    },
  ]);
  return {
    amount: roundMoney(row?.amount ?? 0),
    count: row?.count ?? 0,
    overdueAmount: roundMoney(row?.overdueAmount ?? 0),
    overdueCount: row?.overdueCount ?? 0,
  };
}

async function outstandingBookings(organizationId, today, { limit, paymentStatus, ...scope } = {}) {
  const query = Booking.find({
    ...bookingMatch(organizationId, scope),
    status: { $ne: 'cancelled' },
    'totals.balance': { $gt: MONEY_EPSILON },
    ...(paymentStatus?.length ? { paymentStatus: { $in: paymentStatus } } : {}),
  })
    .select('bookingNumber eventType eventDate status paymentStatus totals.grandTotal totals.netPaid totals.balance customer hall')
    .populate('customer', 'fullName phone')
    .populate('hall', 'name')
    .sort({ eventDate: 1 })
    .lean();
  if (limit) query.limit(limit);
  const rows = await query;
  return rows.map((booking) => ({ ...booking, daysOverdue: booking.eventDate < today ? daysBetween(booking.eventDate, today) : 0 }));
}

// ─── Time series ─────────────────────────────────────────────

function bucketStart(date, granularity) {
  const d = new Date(date);
  if (granularity === 'year') return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  if (granularity === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  if (granularity === 'week') return addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -((d.getUTCDay() + 6) % 7));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextBucket(date, granularity) {
  const d = new Date(date);
  if (granularity === 'year') return new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
  if (granularity === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return addDays(d, granularity === 'week' ? 7 : 1);
}

const truncate = (field, granularity) => ({ $dateTrunc: { date: field, unit: granularity, startOfWeek: 'monday', timezone: 'UTC' } });

/** Revenue, expenses, profit, events and booked value per day/week/month/year, with empty buckets filled in. */
async function financialSeries(organizationId, { from, to, granularity = 'month', ...scope }) {
  const [revenue, expenses, events] = await Promise.all([
    Payment.aggregate([
      { $match: { organizationId, ...notVoided, paidOn: { $gte: from, $lte: to } } },
      ...bookingScopeStages(scope),
      { $group: { _id: truncate('$paidOn', granularity), net: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } },
    ]),
    Expense.aggregate([
      { $match: { organizationId, ...notVoided, date: { $gte: from, $lte: to } } },
      ...bookingScopeStages(scope),
      { $group: { _id: truncate('$date', granularity), total: { $sum: '$amount' } } },
    ]),
    Booking.aggregate([
      { $match: { ...bookingMatch(organizationId, { from, to, ...scope }), status: { $ne: 'cancelled' } } },
      { $group: { _id: truncate('$eventDate', granularity), events: { $sum: 1 }, bookedValue: { $sum: '$totals.grandTotal' }, guests: { $sum: '$guestCount' } } },
    ]),
  ]);
  const key = (date) => formatDateOnly(date);
  const revenueBy = new Map(revenue.map((row) => [key(row._id), row.net]));
  const expenseBy = new Map(expenses.map((row) => [key(row._id), row.total]));
  const eventsBy = new Map(events.map((row) => [key(row._id), row]));

  const series = [];
  for (let cursor = bucketStart(from, granularity); cursor <= to; cursor = nextBucket(cursor, granularity)) {
    const k = key(cursor);
    const rev = roundMoney(revenueBy.get(k) ?? 0);
    const exp = roundMoney(expenseBy.get(k) ?? 0);
    series.push({
      period: k,
      revenue: rev,
      expenses: exp,
      profit: roundMoney(rev - exp),
      events: eventsBy.get(k)?.events ?? 0,
      bookedValue: roundMoney(eventsBy.get(k)?.bookedValue ?? 0),
      guests: eventsBy.get(k)?.guests ?? 0,
    });
  }
  return series;
}

// ─── Bookings ────────────────────────────────────────────────

async function bookingCounts(organizationId, scope) {
  const rows = await Booking.aggregate([{ $match: bookingMatch(organizationId, scope) }, { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$totals.grandTotal' } } }]);
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, { count: row.count, value: roundMoney(row.value) }]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const cancelled = byStatus.cancelled?.count ?? 0;
  return { total, active: total - cancelled, byStatus };
}

async function eventTypeDistribution(organizationId, scope) {
  const rows = await Booking.aggregate([
    { $match: { ...bookingMatch(organizationId, scope), status: { $ne: 'cancelled' } } },
    { $group: { _id: '$eventType', count: { $sum: 1 }, value: { $sum: '$totals.grandTotal' }, guests: { $sum: '$guestCount' } } },
    { $sort: { count: -1 } },
  ]);
  return rows.map((row) => ({ eventType: row._id, count: row.count, value: roundMoney(row.value), averageGuests: Math.round(row.guests / row.count) }));
}

/** For each hall: how many days in the range it was booked, events held, hours used and value booked. */
async function hallUtilization(organizationId, { from, to, hall, eventType }) {
  const days = daysBetween(from, to) + 1;
  const [halls, rows] = await Promise.all([
    Hall.find({ organizationId, ...(hall ? { _id: hall } : {}) }).select('name capacity color status').sort({ name: 1 }).lean(),
    Booking.aggregate([
      { $match: { ...bookingMatch(organizationId, { from, to, hall, eventType }), status: { $in: [...BLOCKING_BOOKING_STATUSES, 'tentative'] } } },
      {
        $group: {
          _id: '$hall',
          events: { $sum: 1 },
          confirmedEvents: { $sum: { $cond: [{ $in: ['$status', BLOCKING_BOOKING_STATUSES] }, 1, 0] } },
          bookedDays: { $addToSet: '$eventDate' },
          hours: { $sum: { $divide: [{ $subtract: ['$endAt', '$startAt'] }, 3600000] } },
          value: { $sum: '$totals.grandTotal' },
          guests: { $sum: '$guestCount' },
        },
      },
    ]),
  ]);
  const byHall = new Map(rows.map((row) => [String(row._id), row]));
  return halls.map((entry) => {
    const row = byHall.get(String(entry._id));
    const bookedDays = row?.bookedDays.length ?? 0;
    return {
      hall: entry,
      days,
      bookedDays,
      events: row?.events ?? 0,
      confirmedEvents: row?.confirmedEvents ?? 0,
      hours: Math.round((row?.hours ?? 0) * 10) / 10,
      utilization: days ? Math.round((bookedDays / days) * 1000) / 10 : 0,
      value: roundMoney(row?.value ?? 0),
      averageGuests: row?.events ? Math.round(row.guests / row.events) : 0,
    };
  });
}

// ─── Customers ───────────────────────────────────────────────

async function customerStats(organizationId, { from, to, timezone }) {
  const createdFrom = zonedDateTimeToUtc(formatDateOnly(from), '00:00', timezone);
  const createdTo = zonedDateTimeToUtc(formatDateOnly(addDays(to, 1)), '00:00', timezone);
  const [newCustomers, activity] = await Promise.all([
    Customer.countDocuments({ organizationId, createdAt: { $gte: createdFrom, $lt: createdTo } }),
    Booking.aggregate([
      { $match: { organizationId, status: { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$customer',
          lifetimeBookings: { $sum: 1 },
          inRange: { $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', from] }, { $lte: ['$eventDate', to] }] }, 1, 0] } },
          spentInRange: { $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', from] }, { $lte: ['$eventDate', to] }] }, '$totals.grandTotal', 0] } },
          paidInRange: { $sum: { $cond: [{ $and: [{ $gte: ['$eventDate', from] }, { $lte: ['$eventDate', to] }] }, '$totals.netPaid', 0] } },
          lifetimeValue: { $sum: '$totals.grandTotal' },
          outstanding: { $sum: { $cond: [{ $gt: ['$totals.balance', 0] }, '$totals.balance', 0] } },
        },
      },
      { $match: { inRange: { $gt: 0 } } },
      { $sort: { spentInRange: -1 } },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer', pipeline: [{ $project: { fullName: 1, phone: 1, city: 1 } }] } },
      { $unwind: '$customer' },
    ]),
  ]);
  const returning = activity.filter((row) => row.lifetimeBookings > 1);
  return {
    summary: {
      newCustomers,
      activeCustomers: activity.length,
      returningCustomers: returning.length,
      returningShare: activity.length ? Math.round((returning.length / activity.length) * 1000) / 10 : 0,
    },
    customers: activity.map((row) => ({
      customer: row.customer,
      bookingsInRange: row.inRange,
      lifetimeBookings: row.lifetimeBookings,
      isReturning: row.lifetimeBookings > 1,
      spent: roundMoney(row.spentInRange),
      paid: roundMoney(row.paidInRange),
      lifetimeValue: roundMoney(row.lifetimeValue),
      outstanding: roundMoney(row.outstanding),
    })),
  };
}

// ─── Events ──────────────────────────────────────────────────

/** Revenue, collection, linked expenses and profit for every event in the range. */
async function eventProfitability(organizationId, { from, to, hall, eventType, customer, paymentStatus }) {
  const rows = await Booking.aggregate([
    {
      $match: {
        ...bookingMatch(organizationId, { from, to, hall, eventType, customer }),
        status: { $ne: 'cancelled' },
        ...(paymentStatus?.length ? { paymentStatus: { $in: paymentStatus } } : {}),
      },
    },
    {
      $lookup: {
        from: 'expenses',
        localField: '_id',
        foreignField: 'booking',
        as: 'expenses',
        pipeline: [{ $match: notVoided }, { $project: { amount: 1 } }],
      },
    },
    { $lookup: { from: 'customers', localField: 'customer', foreignField: '_id', as: 'customer', pipeline: [{ $project: { fullName: 1, phone: 1 } }] } },
    { $lookup: { from: 'halls', localField: 'hall', foreignField: '_id', as: 'hall', pipeline: [{ $project: { name: 1 } }] } },
    {
      $project: {
        bookingNumber: 1,
        eventType: 1,
        eventDate: 1,
        status: 1,
        paymentStatus: 1,
        guestCount: 1,
        customer: { $first: '$customer' },
        hall: { $first: '$hall' },
        revenue: '$totals.grandTotal',
        collected: '$totals.netPaid',
        outstanding: { $max: ['$totals.balance', 0] },
        expenses: { $sum: '$expenses.amount' },
      },
    },
    { $addFields: { profit: { $subtract: ['$revenue', '$expenses'] } } },
    { $sort: { eventDate: 1 } },
  ]);
  const events = rows.map((row) => ({
    ...row,
    revenue: roundMoney(row.revenue),
    collected: roundMoney(row.collected),
    outstanding: roundMoney(row.outstanding),
    expenses: roundMoney(row.expenses),
    profit: roundMoney(row.profit),
    margin: row.revenue > 0 ? Math.round((row.profit / row.revenue) * 1000) / 10 : null,
  }));
  const totals = events.reduce(
    (sum, row) => ({
      events: sum.events + 1,
      revenue: roundMoney(sum.revenue + row.revenue),
      collected: roundMoney(sum.collected + row.collected),
      outstanding: roundMoney(sum.outstanding + row.outstanding),
      expenses: roundMoney(sum.expenses + row.expenses),
      profit: roundMoney(sum.profit + row.profit),
    }),
    { events: 0, revenue: 0, collected: 0, outstanding: 0, expenses: 0, profit: 0 },
  );
  totals.margin = totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 1000) / 10 : null;
  return { events, totals };
}

// ─── Inventory ───────────────────────────────────────────────

async function inventoryStats(organizationId, { from, to }) {
  const [items, movements, consumed] = await Promise.all([
    InventoryItem.find({ organizationId, isActive: true }).populate('supplier', 'name').sort({ kind: 1, category: 1, name: 1 }).lean(),
    InventoryTransaction.aggregate([
      { $match: { organizationId, date: { $gte: from, $lte: to } } },
      { $group: { _id: '$type', movements: { $sum: 1 }, cost: { $sum: '$totalCost' } } },
    ]),
    InventoryTransaction.aggregate([
      { $match: { organizationId, date: { $gte: from, $lte: to }, type: { $in: ['stock_out', 'damaged'] } } },
      { $group: { _id: '$item', quantity: { $sum: { $abs: '$quantityChange' } }, cost: { $sum: '$totalCost' } } },
      { $sort: { cost: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'item', pipeline: [{ $project: { name: 1, unit: 1 } }] } },
      { $unwind: '$item' },
    ]),
  ]);
  const stock = items.map((item) => {
    const status = item.currentQuantity <= 0 ? 'out_of_stock' : item.currentQuantity <= item.minimumQuantity ? 'low_stock' : 'in_stock';
    return {
      _id: item._id,
      name: item.name,
      sku: item.sku,
      kind: item.kind,
      category: item.category,
      unit: item.unit,
      currentQuantity: item.currentQuantity,
      minimumQuantity: item.minimumQuantity,
      costPerUnit: item.costPerUnit,
      value: roundMoney(item.currentQuantity * item.costPerUnit),
      supplier: item.supplier?.name,
      stockStatus: status,
    };
  });
  const byType = Object.fromEntries(movements.map((row) => [row._id, { movements: row.movements, cost: roundMoney(row.cost) }]));
  return {
    summary: {
      items: stock.length,
      stockValue: roundMoney(stock.reduce((sum, item) => sum + item.value, 0)),
      lowStock: stock.filter((item) => item.stockStatus === 'low_stock').length,
      outOfStock: stock.filter((item) => item.stockStatus === 'out_of_stock').length,
      purchases: byType.purchase?.cost ?? 0,
    },
    stock,
    lowStock: stock.filter((item) => item.stockStatus !== 'in_stock'),
    movements: byType,
    topConsumed: consumed.map((row) => ({ item: row.item, quantity: row.quantity, cost: roundMoney(row.cost) })),
  };
}

async function upcomingEvents(organizationId, today, limit = 8) {
  return Booking.find({ organizationId, eventDate: { $gte: today }, status: { $in: OPEN_BOOKING_STATUSES } })
    .select('bookingNumber eventType title eventDate startTime endTime guestCount status paymentStatus totals.grandTotal totals.netPaid totals.balance customer hall')
    .populate('customer', 'fullName phone')
    .populate('hall', 'name color')
    .sort({ startAt: 1 })
    .limit(limit)
    .lean();
}

module.exports = {
  revenueTotals,
  revenueByMethod,
  expenseTotals,
  outstandingTotals,
  outstandingBookings,
  financialSeries,
  bookingCounts,
  eventTypeDistribution,
  hallUtilization,
  customerStats,
  eventProfitability,
  inventoryStats,
  upcomingEvents,
};
