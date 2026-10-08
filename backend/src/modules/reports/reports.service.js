const analytics = require('./analytics');
const { getSystemSettings, getBusinessSettings } = require('../../services/settings');
const { todayInTimeZone, startOfMonthDateOnly, endOfMonthDateOnly, formatDateOnly } = require('../../utils/dates');
const { formatMoney, labelOf, EVENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES, BOOKING_STATUSES, INVENTORY_TRANSACTION_TYPES } = require('../../config/shared');

// Column types drive formatting: CSV gets plain numbers (for Excel maths), PDF gets formatted text.
//   { key, label, type: 'text'|'money'|'number'|'date'|'percent', value?: (row) => unknown, weight?: number }

async function context(ctx, query) {
  const [system, business] = await Promise.all([getSystemSettings(ctx.organizationId), getBusinessSettings(ctx.organizationId)]);
  const today = todayInTimeZone(system.timezone);
  const from = query.from ?? startOfMonthDateOnly(today);
  const to = query.to ?? endOfMonthDateOnly(today);
  const scope = { hall: query.hall, eventType: query.eventType, customer: query.customer };
  const money = (value) => formatMoney(value, business.currency);
  return { today, from, to, scope, money, timezone: system.timezone, currency: business.currency };
}

const periodText = (from, to) => `${formatDateOnly(from)} to ${formatDateOnly(to)}`;

async function financial(ctx, query) {
  const { from, to, scope, money, today } = await context(ctx, query);
  const range = { from, to, ...scope };
  const [revenue, expenses, series, methods, outstanding] = await Promise.all([
    analytics.revenueTotals(ctx.organizationId, range),
    analytics.expenseTotals(ctx.organizationId, range),
    analytics.financialSeries(ctx.organizationId, { ...range, granularity: query.granularity }),
    analytics.revenueByMethod(ctx.organizationId, range),
    analytics.outstandingTotals(ctx.organizationId, today, scope),
  ]);
  const profit = revenue.net - expenses.total;
  const summary = {
    received: revenue.received,
    refunded: revenue.refunded,
    revenue: revenue.net,
    expenses: expenses.total,
    profit,
    margin: revenue.net > 0 ? Math.round((profit / revenue.net) * 1000) / 10 : null,
    outstanding: outstanding.amount,
    overdue: outstanding.overdueAmount,
  };
  return {
    title: 'Profit & Loss',
    data: { from, to, granularity: query.granularity, summary, series, expensesByCategory: expenses.byCategory, revenueByMethod: methods },
    export: {
      subtitle: periodText(from, to),
      kpis: [
        ['Revenue (received)', money(summary.revenue)],
        ['Expenses', money(summary.expenses)],
        ['Profit', money(summary.profit)],
        ['Outstanding', money(summary.outstanding)],
      ],
      columns: [
        { key: 'period', label: 'Period', type: 'date' },
        { key: 'revenue', label: 'Revenue', type: 'money' },
        { key: 'expenses', label: 'Expenses', type: 'money' },
        { key: 'profit', label: 'Profit', type: 'money' },
        { key: 'events', label: 'Events', type: 'number' },
        { key: 'bookedValue', label: 'Booked value', type: 'money' },
      ],
      rows: series,
      extraTables: [
        {
          title: 'Expenses by category',
          columns: [
            { key: 'name', label: 'Category', type: 'text', weight: 2 },
            { key: 'count', label: 'Entries', type: 'number' },
            { key: 'total', label: 'Total', type: 'money' },
          ],
          rows: expenses.byCategory,
        },
        {
          title: 'Revenue by payment method',
          columns: [
            { key: 'method', label: 'Method', type: 'text', value: (row) => labelOf(PAYMENT_METHODS, row.method), weight: 2 },
            { key: 'count', label: 'Payments', type: 'number' },
            { key: 'amount', label: 'Net amount', type: 'money' },
          ],
          rows: methods,
        },
      ],
    },
  };
}

async function bookings(ctx, query) {
  const { from, to, scope } = await context(ctx, query);
  const range = { from, to, ...scope };
  const [counts, eventTypes, halls, series] = await Promise.all([
    analytics.bookingCounts(ctx.organizationId, range),
    analytics.eventTypeDistribution(ctx.organizationId, range),
    analytics.hallUtilization(ctx.organizationId, range),
    analytics.financialSeries(ctx.organizationId, { ...range, granularity: query.granularity }),
  ]);
  const status = (key) => counts.byStatus[key]?.count ?? 0;
  return {
    title: 'Bookings & Hall Utilisation',
    data: { from, to, counts, eventTypes, halls, series: series.map(({ period, events, guests, bookedValue }) => ({ period, events, guests, bookedValue })) },
    export: {
      subtitle: periodText(from, to),
      kpis: [
        ['Events', String(counts.active)],
        ['Completed', String(status('completed'))],
        ['Upcoming (confirmed)', String(status('confirmed'))],
        ['Cancelled', String(status('cancelled'))],
      ],
      columns: [
        { key: 'hall', label: 'Hall', type: 'text', value: (row) => row.hall.name, weight: 2 },
        { key: 'events', label: 'Events', type: 'number' },
        { key: 'bookedDays', label: 'Days booked', type: 'number' },
        { key: 'days', label: 'Days in period', type: 'number' },
        { key: 'utilization', label: 'Utilisation %', type: 'percent' },
        { key: 'hours', label: 'Hours', type: 'number' },
        { key: 'averageGuests', label: 'Avg guests', type: 'number' },
        { key: 'value', label: 'Booked value', type: 'money' },
      ],
      rows: halls,
      extraTables: [
        {
          title: 'Event types',
          columns: [
            { key: 'eventType', label: 'Event type', type: 'text', value: (row) => labelOf(EVENT_TYPES, row.eventType), weight: 2 },
            { key: 'count', label: 'Events', type: 'number' },
            { key: 'averageGuests', label: 'Avg guests', type: 'number' },
            { key: 'value', label: 'Value', type: 'money' },
          ],
          rows: eventTypes,
        },
        {
          title: 'By status',
          columns: [
            { key: 'status', label: 'Status', type: 'text', weight: 2 },
            { key: 'count', label: 'Bookings', type: 'number' },
            { key: 'value', label: 'Value', type: 'money' },
          ],
          rows: BOOKING_STATUSES.map((entry) => ({ status: entry.label, count: status(entry.value), value: counts.byStatus[entry.value]?.value ?? 0 })),
        },
      ],
    },
  };
}

async function customers(ctx, query) {
  const { from, to, money, timezone } = await context(ctx, query);
  const stats = await analytics.customerStats(ctx.organizationId, { from, to, timezone });
  return {
    title: 'Customers',
    data: { from, to, ...stats },
    export: {
      subtitle: periodText(from, to),
      kpis: [
        ['New customers', String(stats.summary.newCustomers)],
        ['Customers with events', String(stats.summary.activeCustomers)],
        ['Returning customers', String(stats.summary.returningCustomers)],
        ['Top spend', money(stats.customers[0]?.spent ?? 0)],
      ],
      columns: [
        { key: 'name', label: 'Customer', type: 'text', value: (row) => row.customer.fullName, weight: 2 },
        { key: 'phone', label: 'Phone', type: 'text', value: (row) => row.customer.phone, weight: 1.4 },
        { key: 'bookingsInRange', label: 'Events', type: 'number' },
        { key: 'isReturning', label: 'Returning', type: 'text', value: (row) => (row.isReturning ? 'Yes' : 'No') },
        { key: 'spent', label: 'Spend', type: 'money' },
        { key: 'paid', label: 'Paid', type: 'money' },
        { key: 'outstanding', label: 'Outstanding', type: 'money' },
      ],
      rows: stats.customers,
    },
  };
}

async function events(ctx, query) {
  const { from, to, scope, money } = await context(ctx, query);
  const result = await analytics.eventProfitability(ctx.organizationId, { from, to, ...scope, paymentStatus: query.paymentStatus });
  return {
    title: 'Event Profitability',
    data: { from, to, ...result },
    export: {
      subtitle: periodText(from, to),
      kpis: [
        ['Events', String(result.totals.events)],
        ['Event revenue', money(result.totals.revenue)],
        ['Event expenses', money(result.totals.expenses)],
        ['Event profit', money(result.totals.profit)],
      ],
      columns: [
        { key: 'eventDate', label: 'Date', type: 'date' },
        { key: 'bookingNumber', label: 'Booking', type: 'text', weight: 1.3 },
        { key: 'customer', label: 'Customer', type: 'text', value: (row) => row.customer?.fullName, weight: 1.6 },
        { key: 'eventType', label: 'Event', type: 'text', value: (row) => labelOf(EVENT_TYPES, row.eventType) },
        { key: 'hall', label: 'Hall', type: 'text', value: (row) => row.hall?.name },
        { key: 'revenue', label: 'Revenue', type: 'money' },
        { key: 'expenses', label: 'Expenses', type: 'money' },
        { key: 'profit', label: 'Profit', type: 'money' },
        { key: 'margin', label: 'Margin %', type: 'percent' },
        { key: 'outstanding', label: 'Outstanding', type: 'money', weight: 1.25 },
      ],
      rows: result.events,
    },
  };
}

async function inventory(ctx, query) {
  const { from, to, money } = await context(ctx, query);
  const stats = await analytics.inventoryStats(ctx.organizationId, { from, to });
  return {
    title: 'Inventory',
    data: { from, to, ...stats },
    export: {
      subtitle: `Stock as of today · movements ${periodText(from, to)}`,
      kpis: [
        ['Items', String(stats.summary.items)],
        ['Stock value', money(stats.summary.stockValue)],
        ['Low / out of stock', `${stats.summary.lowStock} / ${stats.summary.outOfStock}`],
        ['Purchases in period', money(stats.summary.purchases)],
      ],
      columns: [
        { key: 'name', label: 'Item', type: 'text', weight: 1.8 },
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'category', label: 'Category', type: 'text' },
        { key: 'currentQuantity', label: 'On hand', type: 'number' },
        { key: 'unit', label: 'Unit', type: 'text', weight: 0.7 },
        { key: 'minimumQuantity', label: 'Minimum', type: 'number' },
        { key: 'value', label: 'Value', type: 'money' },
        { key: 'stockStatus', label: 'Status', type: 'text', value: (row) => ({ in_stock: 'In stock', low_stock: 'Low', out_of_stock: 'Out' })[row.stockStatus] },
      ],
      rows: stats.stock,
      extraTables: [
        {
          title: 'Stock movements in period',
          columns: [
            { key: 'type', label: 'Movement', type: 'text', value: (row) => labelOf(INVENTORY_TRANSACTION_TYPES, row.type), weight: 2 },
            { key: 'movements', label: 'Entries', type: 'number' },
            { key: 'cost', label: 'Value', type: 'money' },
          ],
          rows: Object.entries(stats.movements).map(([type, row]) => ({ type, ...row })),
        },
      ],
    },
  };
}

async function outstanding(ctx, query) {
  const { today, scope, money } = await context(ctx, query);
  const [totals, rows] = await Promise.all([
    analytics.outstandingTotals(ctx.organizationId, today, scope),
    analytics.outstandingBookings(ctx.organizationId, today, { ...scope, paymentStatus: query.paymentStatus }),
  ]);
  return {
    title: 'Outstanding Payments',
    data: { totals, bookings: rows },
    export: {
      subtitle: `As of ${formatDateOnly(today)}`,
      kpis: [
        ['Total outstanding', money(totals.amount)],
        ['Bookings with balance', String(totals.count)],
        ['Overdue (event held)', money(totals.overdueAmount)],
        ['Overdue bookings', String(totals.overdueCount)],
      ],
      columns: [
        { key: 'eventDate', label: 'Event date', type: 'date' },
        { key: 'bookingNumber', label: 'Booking', type: 'text', weight: 1.3 },
        { key: 'customer', label: 'Customer', type: 'text', value: (row) => row.customer?.fullName, weight: 1.6 },
        { key: 'phone', label: 'Phone', type: 'text', value: (row) => row.customer?.phone, weight: 1.3 },
        { key: 'hall', label: 'Hall', type: 'text', value: (row) => row.hall?.name },
        { key: 'paymentStatus', label: 'Status', type: 'text', value: (row) => labelOf(PAYMENT_STATUSES, row.paymentStatus) },
        { key: 'grandTotal', label: 'Total', type: 'money', value: (row) => row.totals.grandTotal },
        { key: 'netPaid', label: 'Paid', type: 'money', value: (row) => row.totals.netPaid },
        { key: 'balance', label: 'Balance', type: 'money', value: (row) => row.totals.balance },
        { key: 'daysOverdue', label: 'Days overdue', type: 'number' },
      ],
      rows,
    },
  };
}

module.exports = { financial, bookings, customers, events, inventory, outstanding };
