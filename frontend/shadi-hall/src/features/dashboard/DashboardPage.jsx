import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Wallet,
  Receipt,
  TrendingUp,
  HandCoins,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  Ban,
  PartyPopper,
  Boxes,
  UserPlus,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { dashboardApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMoney } from '@/lib/hooks';
import { formatDate, formatRelative, formatTime, formatNumber } from '@/lib/format';
import { EVENT_TYPES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Controls';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageLoader, Alert } from '@/components/ui/Feedback';
import { BarList, ChartWithTable, ColumnChart } from '@/components/charts/Charts';
import { SERIES_COLORS } from '@/components/charts/seriesColors';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'year', label: 'This year' },
];

const CHART_VIEWS = [
  { value: 'both', label: 'Revenue vs expenses' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'profit', label: 'Profit' },
];

const SERIES = {
  revenue: { key: 'revenue', label: 'Revenue received', color: SERIES_COLORS.revenue },
  expenses: { key: 'expenses', label: 'Expenses', color: SERIES_COLORS.expenses },
  profit: { key: 'profit', label: 'Profit', color: SERIES_COLORS.profit },
};

const monthLabel = (period) => format(parseISO(period), 'MMM yy');

export function DateTile({ date, isToday = false }) {
  const day = parseISO(String(date).slice(0, 10));
  return (
    <div className={`date-tile${isToday ? ' date-tile--today' : ''}`} aria-hidden>
      <span className="date-tile__month">{format(day, 'MMM')}</span>
      <span className="date-tile__day">{format(day, 'd')}</span>
      <span className="date-tile__weekday">{format(day, 'EEE')}</span>
    </div>
  );
}

function MoneyTrend({ monthly }) {
  const money = useMoney();
  const [view, setView] = useState('both');
  const series = view === 'both' ? [SERIES.revenue, SERIES.expenses] : [SERIES[view]];
  return (
    <Card>
      <CardHeader title="Money in and out" subtitle="Last 12 months · revenue is money actually received" />
      <CardBody>
        <ChartWithTable
          leading={<Segmented label="Chart" options={CHART_VIEWS} value={view} onChange={setView} />}
          chart={<ColumnChart data={monthly} xKey="period" series={series} formatValue={money.format} formatTick={money.compact} formatLabel={monthLabel} />}
          columns={[
            { key: 'period', header: 'Month', render: (row) => format(parseISO(row.period), 'MMMM yyyy') },
            { key: 'revenue', header: 'Revenue', align: 'right', render: (row) => money.format(row.revenue) },
            { key: 'expenses', header: 'Expenses', align: 'right', render: (row) => money.format(row.expenses) },
            { key: 'profit', header: 'Profit', align: 'right', render: (row) => <span className={row.profit < 0 ? 'text-danger' : undefined}>{money.format(row.profit)}</span> },
          ]}
          rows={monthly}
        />
      </CardBody>
    </Card>
  );
}

function BookingTrend({ monthly }) {
  return (
    <Card>
      <CardHeader title="Booking trend" subtitle="Events held or scheduled per month (cancelled excluded)" />
      <CardBody>
        <ChartWithTable
          chart={
            <ColumnChart
              data={monthly}
              xKey="period"
              series={[{ key: 'events', label: 'Events', color: SERIES_COLORS.single }]}
              formatValue={(value) => `${value} event${value === 1 ? '' : 's'}`}
              formatTick={(value) => String(value)}
              formatLabel={monthLabel}
              height={200}
            />
          }
          columns={[
            { key: 'period', header: 'Month', render: (row) => format(parseISO(row.period), 'MMMM yyyy') },
            { key: 'events', header: 'Events', align: 'right' },
            { key: 'guests', header: 'Guests', align: 'right', render: (row) => formatNumber(row.guests) },
          ]}
          rows={monthly}
        />
      </CardBody>
    </Card>
  );
}

function UpcomingEvents({ events, today, showMoney }) {
  const money = useMoney();
  return (
    <Card>
      <CardHeader title="Upcoming events" actions={<Button size="sm" variant="ghost" to="/calendar">Calendar</Button>} />
      {events.length === 0 ? (
        <EmptyState compact icon={CalendarDays} title="No upcoming events">
          New bookings will appear here.
        </EmptyState>
      ) : (
        <div>
          {events.map((event) => (
            <Link key={event._id} to={`/bookings/${event._id}`} className="event-row">
              <DateTile date={event.eventDate} isToday={String(event.eventDate).slice(0, 10) === today} />
              <div style={{ minWidth: 0 }}>
                <div className="table-primary truncate">{event.customer?.fullName}</div>
                <div className="table-secondary truncate">
                  {labelOf(EVENT_TYPES, event.eventType)} · {formatTime(event.startTime)} · {formatNumber(event.guestCount)} guests
                </div>
                <span className="hall-chip">
                  <span className="color-dot" style={{ background: event.hall?.color }} aria-hidden />
                  {event.hall?.name}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <BookingStatusBadge status={event.status} />
                {showMoney && event.totals && (
                  <div className="table-secondary tabular" style={{ marginTop: 4 }}>
                    {event.totals.balance > 0 ? (
                      <span className="text-danger strong">{money.format(event.totals.balance)} due</span>
                    ) : (
                      <span className="text-success strong">Paid</span>
                    )}
                    <div>of {money.format(event.totals.grandTotal)}</div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function WhoOwes({ bookings, pending }) {
  const money = useMoney();
  return (
    <Card>
      <CardHeader
        title="Who owes money"
        subtitle={`${pending.count} booking${pending.count === 1 ? '' : 's'} · ${money.format(pending.amount)} outstanding`}
        actions={
          <Button size="sm" variant="ghost" to="/reports?tab=outstanding">
            All
          </Button>
        }
      />
      {bookings.length === 0 ? (
        <EmptyState compact icon={CircleCheck} title="Nothing outstanding">
          Every booking is fully paid.
        </EmptyState>
      ) : (
        <ul className="list-plain">
          {bookings.map((booking) => (
            <li key={booking._id}>
              <Link to={`/bookings/${booking._id}`} className="list-row">
                <div className="list-row__main">
                  <div className="table-primary truncate">{booking.customer?.fullName}</div>
                  <div className="table-secondary">
                    {booking.bookingNumber} · {formatDate(booking.eventDate)}
                    {booking.daysOverdue > 0 && <span className="text-danger strong"> · {booking.daysOverdue} days overdue</span>}
                  </div>
                </div>
                <span className="text-danger strong tabular">{money.format(booking.totals.balance)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const ACTIVITY_ICONS = {
  'payment.received': { icon: HandCoins, tone: 'money' },
  'payment.refunded': { icon: HandCoins, tone: 'spend' },
  'payment.voided': { icon: Ban, tone: 'spend' },
  'expense.created': { icon: Receipt, tone: 'spend' },
  'expense.voided': { icon: Ban, tone: 'spend' },
  'staff.salary_paid': { icon: Wallet, tone: 'spend' },
  'booking.created': { icon: CalendarCheck, tone: 'booking' },
  'booking.confirmed': { icon: CircleCheck, tone: 'booking' },
  'booking.completed': { icon: PartyPopper, tone: 'booking' },
  'booking.cancelled': { icon: Ban, tone: 'spend' },
  'customer.created': { icon: UserPlus, tone: 'booking' },
  'invoice.generated': { icon: FileText, tone: 'booking' },
};

function RecentActivity({ items }) {
  return (
    <Card>
      <CardHeader title="Recent activity" />
      {items.length === 0 ? (
        <EmptyState compact title="No activity yet" />
      ) : (
        <ul className="list-plain">
          {items.map((item) => {
            const { icon: Icon, tone } = ACTIVITY_ICONS[item.action] ?? { icon: CalendarClock, tone: '' };
            return (
              <li key={item._id} className="activity-item">
                <span className={`activity-item__icon${tone ? ` activity-item__icon--${tone}` : ''}`}>
                  <Icon size={15} aria-hidden />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="activity-item__text">{item.summary}</div>
                  <div className="table-secondary">
                    {item.actorName ?? 'System'} · {formatRelative(item.createdAt)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { organization, can } = useAuth();
  const money = useMoney();
  const [period, setPeriod] = useState('month');
  const query = useQuery({ queryKey: ['dashboard', period], queryFn: () => dashboardApi.get({ period }), placeholderData: keepPreviousData });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const today = String(data.today).slice(0, 10);
  const { financials, bookings } = data;

  return (
    <div className={query.isFetching && query.isPlaceholderData ? 'is-refreshing' : undefined}>
      <PageHeader title="Dashboard" subtitle={`${organization?.name} · ${data.period.label}`} actions={<Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} />} />

      {data.todayEvents.length > 0 && (
        <div className="today-banner">
          <PartyPopper size={22} color="var(--gold-600)" aria-hidden />
          <strong>
            Today: {data.todayEvents.length} event{data.todayEvents.length === 1 ? '' : 's'}
          </strong>
          <div className="today-banner__events">
            {data.todayEvents.map((event) => (
              <Link key={event._id} to={`/bookings/${event._id}`} className="today-banner__event">
                <span className="color-dot" style={{ background: event.hall?.color }} aria-hidden />
                {labelOf(EVENT_TYPES, event.eventType)} · {event.customer?.fullName} · {event.hall?.name} · {formatTime(event.startTime)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="stack stack--lg">
        {financials && (
          <div className="grid grid--4">
            <StatCard hero label="Money received" icon={Wallet} value={money.format(financials.revenue.amount)} change={financials.revenue.change} changeLabel="vs previous period" meta={financials.revenue.refunded ? `${money.format(financials.revenue.refunded)} refunded` : undefined} to="/payments" />
            <StatCard label="Money spent" icon={Receipt} tone="danger" value={money.format(financials.expenses.amount)} change={financials.expenses.change} upIsGood={false} changeLabel="vs previous period" to="/expenses" />
            <StatCard label="Net profit" icon={TrendingUp} tone="success" value={money.format(financials.profit.amount)} danger={financials.profit.amount < 0} change={financials.profit.change} changeLabel="vs previous period" meta={financials.profit.margin !== null ? `${financials.profit.margin}% margin` : undefined} to="/reports" />
            <StatCard
              label="Pending payments"
              icon={HandCoins}
              tone="gold"
              value={money.format(financials.pending.amount)}
              danger={financials.pending.amount > 0}
              meta={financials.pending.overdueAmount > 0 ? `${money.format(financials.pending.overdueAmount)} overdue on ${financials.pending.overdueCount} past event${financials.pending.overdueCount === 1 ? '' : 's'}` : `${financials.pending.count} bookings with a balance`}
              to="/reports?tab=outstanding"
            />
          </div>
        )}

        <div className="grid grid--stats">
          <StatCard label="Bookings this period" icon={CalendarCheck} value={formatNumber(bookings.total)} meta={`${bookings.confirmed} confirmed · ${bookings.pending} pending`} to="/bookings" />
          <StatCard label="Upcoming events" icon={CalendarClock} tone="info" value={formatNumber(bookings.upcoming)} meta="From today onward" to="/bookings?tab=upcoming" />
          <StatCard label="Today’s events" icon={PartyPopper} tone="gold" value={formatNumber(bookings.today)} to="/calendar?view=day" />
          <StatCard label="Completed" icon={CircleCheck} tone="success" value={formatNumber(bookings.completed)} meta="In this period" />
          <StatCard label="Cancelled" icon={Ban} tone="danger" value={formatNumber(bookings.cancelled)} meta="In this period" />
        </div>

        {data.alerts.lowStock > 0 && can('inventory.view') && (
          <Alert
            tone="warning"
            title={`${data.alerts.lowStock} inventory item${data.alerts.lowStock === 1 ? ' is' : 's are'} low or out of stock`}
            action={
              <Button size="sm" to="/inventory?stockStatus=low_stock,out_of_stock" icon={Boxes}>
                See what to buy
              </Button>
            }
          >
            Restock before your next events.
          </Alert>
        )}

        <div className="dashboard-grid">
          <div className="stack">
            {data.charts && <MoneyTrend monthly={data.charts.monthly} />}
            {data.charts && <BookingTrend monthly={data.charts.monthly} />}
            <Card>
              <CardHeader title="Event types" subtitle={`${data.period.label} · by number of events`} />
              <CardBody>
                <BarList
                  rows={data.eventTypes.map((row) => ({
                    key: row.eventType,
                    label: labelOf(EVENT_TYPES, row.eventType),
                    value: row.count,
                    note: financials ? `${money.format(row.value)} · avg ${formatNumber(row.averageGuests)} guests` : `avg ${formatNumber(row.averageGuests)} guests`,
                  }))}
                  formatValue={(value) => String(value)}
                />
              </CardBody>
            </Card>
          </div>
          <div className="stack">
            <UpcomingEvents events={data.upcomingEvents} today={today} showMoney={Boolean(financials)} />
            {financials && <WhoOwes bookings={data.topOutstanding} pending={financials.pending} />}
            <RecentActivity items={data.recentActivity} />
            {can('bookings.view') && (
              <Link to="/bookings" className="row" style={{ justifyContent: 'center', fontWeight: 600 }}>
                All bookings <ArrowRight size={15} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
