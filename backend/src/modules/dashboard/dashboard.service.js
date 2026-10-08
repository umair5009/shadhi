const { Booking, AuditLog, InventoryItem } = require('../../models');
const analytics = require('../reports/analytics');
const { getSystemSettings } = require('../../services/settings');
const {
  todayInTimeZone,
  resolvePeriod,
  daysBetween,
  addDays,
  addMonthsDateOnly,
  startOfMonthDateOnly,
  endOfMonthDateOnly,
} = require('../../utils/dates');
const { OPEN_BOOKING_STATUSES, roundMoney } = require('../../config/shared');

// Actions shown in "Recent activity". Money actions are only shown to users who may see financial figures.
const OPERATIONAL_ACTIONS = ['booking.created', 'booking.confirmed', 'booking.cancelled', 'booking.completed', 'customer.created'];
const FINANCIAL_ACTIONS = ['payment.received', 'payment.refunded', 'payment.voided', 'expense.created', 'expense.voided', 'invoice.generated', 'staff.salary_paid'];

/** The period before the selected one, of the same length (or the previous calendar month for "month"). */
function previousRange(period, range) {
  if (period === 'month' || period === 'last_month') {
    const from = addMonthsDateOnly(range.from, -1);
    return { from, to: endOfMonthDateOnly(from) };
  }
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

function change(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

async function getDashboard(ctx, query) {
  const settings = await getSystemSettings(ctx.organizationId);
  const today = todayInTimeZone(settings.timezone);
  const range = resolvePeriod(query, settings.timezone);
  const previous = previousRange(query.period ?? 'month', range);
  const canSeeMoney = ctx.can('dashboard.financials');
  const organizationId = ctx.organizationId;

  const [counts, eventTypes, upcoming, todayEvents, upcomingCount, activity, lowStock] = await Promise.all([
    analytics.bookingCounts(organizationId, range),
    analytics.eventTypeDistribution(organizationId, range),
    analytics.upcomingEvents(organizationId, today, 8),
    Booking.find({ organizationId, eventDate: today, status: { $ne: 'cancelled' } })
      .select('bookingNumber eventType title startTime endTime guestCount status totals.balance customer hall')
      .populate('customer', 'fullName phone')
      .populate('hall', 'name color')
      .sort({ startAt: 1 })
      .lean(),
    Booking.countDocuments({ organizationId, eventDate: { $gte: today }, status: { $in: OPEN_BOOKING_STATUSES } }),
    AuditLog.find({ organizationId, action: { $in: canSeeMoney ? [...OPERATIONAL_ACTIONS, ...FINANCIAL_ACTIONS] : OPERATIONAL_ACTIONS } })
      .sort({ createdAt: -1 })
      .limit(12)
      .select('action actorName summary entity createdAt')
      .lean(),
    ctx.can('inventory.view')
      ? InventoryItem.countDocuments({ organizationId, isActive: true, $expr: { $lte: ['$currentQuantity', '$minimumQuantity'] } })
      : null,
  ]);

  const dashboard = {
    period: { key: query.period ?? 'month', label: range.label, from: range.from, to: range.to },
    today,
    bookings: {
      total: counts.active,
      completed: counts.byStatus.completed?.count ?? 0,
      cancelled: counts.byStatus.cancelled?.count ?? 0,
      confirmed: counts.byStatus.confirmed?.count ?? 0,
      pending: (counts.byStatus.inquiry?.count ?? 0) + (counts.byStatus.tentative?.count ?? 0),
      upcoming: upcomingCount,
      today: todayEvents.length,
    },
    eventTypes,
    upcomingEvents: upcoming,
    todayEvents,
    recentActivity: activity,
    alerts: { lowStock },
    financials: null,
    charts: null,
  };

  if (!canSeeMoney) {
    for (const event of [...dashboard.upcomingEvents, ...dashboard.todayEvents]) delete event.totals;
    return dashboard;
  }

  const seriesFrom = addMonthsDateOnly(startOfMonthDateOnly(today), -11);
  const [revenue, previousRevenue, expenses, previousExpenses, outstanding, topOutstanding, monthly] = await Promise.all([
    analytics.revenueTotals(organizationId, range),
    analytics.revenueTotals(organizationId, previous),
    analytics.expenseTotals(organizationId, range),
    analytics.expenseTotals(organizationId, previous),
    analytics.outstandingTotals(organizationId, today),
    analytics.outstandingBookings(organizationId, today, { limit: 6 }),
    analytics.financialSeries(organizationId, { from: seriesFrom, to: endOfMonthDateOnly(today), granularity: 'month' }),
  ]);
  const profit = roundMoney(revenue.net - expenses.total);
  const previousProfit = roundMoney(previousRevenue.net - previousExpenses.total);

  dashboard.financials = {
    revenue: { amount: revenue.net, received: revenue.received, refunded: revenue.refunded, change: change(revenue.net, previousRevenue.net) },
    expenses: { amount: expenses.total, change: change(expenses.total, previousExpenses.total), byCategory: expenses.byCategory.slice(0, 6) },
    profit: { amount: profit, change: change(profit, previousProfit), margin: revenue.net > 0 ? Math.round((profit / revenue.net) * 1000) / 10 : null },
    pending: outstanding,
    bookedValue: roundMoney((counts.byStatus.confirmed?.value ?? 0) + (counts.byStatus.completed?.value ?? 0) + (counts.byStatus.tentative?.value ?? 0) + (counts.byStatus.inquiry?.value ?? 0)),
  };
  dashboard.charts = { monthly };
  dashboard.topOutstanding = topOutstanding;
  return dashboard;
}

module.exports = { getDashboard };
