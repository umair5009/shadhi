import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { FileDown, Sheet, Wallet, Receipt, TrendingUp, HandCoins, CalendarCheck, CircleCheck, Ban, UserPlus, Users, Repeat, Boxes, PackageMinus, TriangleAlert, Percent } from 'lucide-react';
import { reportsApi } from '@/api/endpoints';
import { downloadFile } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHallOptions } from '@/features/halls/useHalls';
import { useListParams, useMoney, useToday } from '@/lib/hooks';
import { presetRange } from '@/lib/dates';
import { formatDate, formatNumber, percent } from '@/lib/format';
import { EVENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES, INVENTORY_TRANSACTION_TYPES, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, Segmented, ProgressBar } from '@/components/ui/Controls';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/DataTable';
import { Badge, PaymentStatusBadge, StockBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { DateRangeFilter, FilterSelect } from '@/components/ui/Filters';
import { BarList, ChartWithTable, ColumnChart } from '@/components/charts/Charts';
import { SERIES_COLORS } from '@/components/charts/seriesColors';

const REPORTS = [
  { value: 'financial', label: 'Profit & loss' },
  { value: 'bookings', label: 'Bookings & halls' },
  { value: 'customers', label: 'Customers' },
  { value: 'events', label: 'Event profit' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'outstanding', label: 'Outstanding' },
];

const GRANULARITIES = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

const periodLabel = (granularity) => (period) => {
  const date = parseISO(period);
  if (granularity === 'year') return format(date, 'yyyy');
  if (granularity === 'month') return format(date, 'MMM yy');
  return format(date, 'd MMM');
};

function FinancialReport({ data }) {
  const money = useMoney();
  const { summary, series, granularity } = data;
  const label = periodLabel(granularity);
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard hero label="Revenue received" icon={Wallet} value={money.format(summary.revenue)} meta={summary.refunded ? `${money.format(summary.received)} received · ${money.format(summary.refunded)} refunded` : undefined} />
        <StatCard label="Expenses" icon={Receipt} tone="danger" value={money.format(summary.expenses)} />
        <StatCard label="Profit" icon={TrendingUp} tone="success" value={money.format(summary.profit)} danger={summary.profit < 0} meta={summary.margin !== null ? `${summary.margin}% margin` : undefined} />
        <StatCard label="Outstanding now" icon={HandCoins} tone="gold" value={money.format(summary.outstanding)} danger={summary.outstanding > 0} meta={summary.overdue ? `${money.format(summary.overdue)} overdue` : undefined} />
      </div>
      <Card>
        <CardHeader title="Revenue and expenses" subtitle="Money received vs money spent in each period" />
        <CardBody>
          <ChartWithTable
            chart={
              <ColumnChart
                data={series}
                xKey="period"
                series={[
                  { key: 'revenue', label: 'Revenue', color: SERIES_COLORS.revenue },
                  { key: 'expenses', label: 'Expenses', color: SERIES_COLORS.expenses },
                ]}
                formatValue={money.format}
                formatTick={money.compact}
                formatLabel={label}
                height={300}
              />
            }
            columns={[
              { key: 'period', header: 'Period', render: (row) => label(row.period) },
              { key: 'revenue', header: 'Revenue', align: 'right', render: (row) => money.format(row.revenue) },
              { key: 'expenses', header: 'Expenses', align: 'right', render: (row) => money.format(row.expenses) },
              { key: 'profit', header: 'Profit', align: 'right', render: (row) => <span className={row.profit < 0 ? 'text-danger' : undefined}>{money.format(row.profit)}</span> },
            ]}
            rows={series}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Profit per period" subtitle="Revenue minus expenses — bars below the line are losses" />
        <CardBody>
          <ColumnChart data={series} xKey="period" series={[{ key: 'profit', label: 'Profit', color: SERIES_COLORS.profit }]} formatValue={money.format} formatTick={money.compact} formatLabel={label} height={220} />
        </CardBody>
      </Card>
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader title="Expenses by category" />
          <CardBody>
            <BarList rows={data.expensesByCategory.map((row) => ({ key: row.categoryId, label: row.name, value: row.total, note: `${row.count} entries` }))} formatValue={money.format} color={SERIES_COLORS.expenses} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Revenue by payment method" />
          <CardBody>
            <BarList rows={data.revenueByMethod.map((row) => ({ key: row.method, label: labelOf(PAYMENT_METHODS, row.method), value: row.amount, note: `${row.count} payments` }))} formatValue={money.format} color={SERIES_COLORS.revenue} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function BookingsReport({ data, granularity }) {
  const money = useMoney();
  const { can } = useAuth();
  const count = (status) => data.counts.byStatus[status]?.count ?? 0;
  const label = periodLabel(granularity);
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard label="Events" icon={CalendarCheck} value={formatNumber(data.counts.active)} meta={`${data.counts.total} bookings incl. cancelled`} />
        <StatCard label="Completed" icon={CircleCheck} tone="success" value={formatNumber(count('completed'))} />
        <StatCard label="Confirmed (to come)" icon={CalendarCheck} tone="info" value={formatNumber(count('confirmed'))} meta={`${count('tentative') + count('inquiry')} inquiries / holds`} />
        <StatCard label="Cancelled" icon={Ban} tone="danger" value={formatNumber(count('cancelled'))} />
      </div>
      <Card>
        <CardHeader title="Hall utilisation" subtitle="Days each hall was booked (confirmed, completed or held) in the period" />
        <DataTable
          columns={[
            {
              key: 'hall',
              header: 'Hall',
              render: (row) => (
                <span className="hall-chip" style={{ fontSize: 'inherit', fontWeight: 600 }}>
                  <span className="color-dot" style={{ background: row.hall.color }} aria-hidden />
                  {row.hall.name}
                </span>
              ),
            },
            { key: 'events', header: 'Events', align: 'right' },
            { key: 'bookedDays', header: 'Days booked', align: 'right', render: (row) => `${row.bookedDays} / ${row.days}` },
            {
              key: 'utilization',
              header: 'Utilisation',
              render: (row) => (
                <div className="row" style={{ flexWrap: 'nowrap', minWidth: 160 }}>
                  <div style={{ flex: 1 }}>
                    <ProgressBar value={row.utilization} tone="brand" label={`${row.hall.name} utilisation`} />
                  </div>
                  <span className="tabular strong" style={{ width: 52, textAlign: 'right' }}>
                    {percent(row.utilization, 1)}
                  </span>
                </div>
              ),
            },
            { key: 'hours', header: 'Hours', align: 'right' },
            { key: 'averageGuests', header: 'Avg guests', align: 'right', render: (row) => formatNumber(row.averageGuests) },
            ...(can('payments.view') ? [{ key: 'value', header: 'Booked value', align: 'right', render: (row) => money.format(row.value) }] : []),
          ]}
          rows={data.halls}
          rowKey={(row) => row.hall._id}
        />
      </Card>
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader title="Events per period" />
          <CardBody>
            <ColumnChart data={data.series} xKey="period" series={[{ key: 'events', label: 'Events', color: SERIES_COLORS.single }]} formatValue={(value) => `${value} events`} formatTick={String} formatLabel={label} height={220} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Event types" />
          <CardBody>
            <BarList
              rows={data.eventTypes.map((row) => ({ key: row.eventType, label: labelOf(EVENT_TYPES, row.eventType), value: row.count, note: `avg ${formatNumber(row.averageGuests)} guests${can('payments.view') ? ` · ${money.format(row.value)}` : ''}` }))}
              formatValue={String}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function CustomersReport({ data }) {
  const money = useMoney();
  const navigate = useNavigate();
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard label="New customers" icon={UserPlus} value={formatNumber(data.summary.newCustomers)} meta="Added in the period" />
        <StatCard label="Customers with events" icon={Users} tone="info" value={formatNumber(data.summary.activeCustomers)} />
        <StatCard label="Returning customers" icon={Repeat} tone="success" value={formatNumber(data.summary.returningCustomers)} meta={`${data.summary.returningShare}% of customers with events`} />
        <StatCard label="Top spend" icon={TrendingUp} tone="gold" value={money.format(data.customers[0]?.spent ?? 0)} meta={data.customers[0]?.customer.fullName} />
      </div>
      <Card>
        <CardHeader title="Customer spending" subtitle="Customers with events in the period, highest spend first" />
        <DataTable
          columns={[
            {
              key: 'customer',
              header: 'Customer',
              render: (row) => (
                <>
                  <div className="table-primary">{row.customer.fullName}</div>
                  <div className="table-secondary">{row.customer.phone}</div>
                </>
              ),
            },
            { key: 'events', header: 'Events', align: 'right', render: (row) => row.bookingsInRange },
            { key: 'returning', header: 'Type', render: (row) => (row.isReturning ? <Badge tone="success">Returning · {row.lifetimeBookings} bookings</Badge> : <Badge>New</Badge>) },
            { key: 'spent', header: 'Spend', align: 'right', render: (row) => money.format(row.spent) },
            { key: 'paid', header: 'Paid', align: 'right', render: (row) => money.format(row.paid) },
            { key: 'outstanding', header: 'Owes', align: 'right', render: (row) => (row.outstanding > 0 ? <span className="text-danger strong">{money.format(row.outstanding)}</span> : '—') },
            { key: 'lifetime', header: 'Lifetime value', align: 'right', render: (row) => money.format(row.lifetimeValue) },
          ]}
          rows={data.customers}
          rowKey={(row) => row.customer._id}
          onRowClick={(row) => navigate(`/customers/${row.customer._id}`)}
          empty={<EmptyState compact icon={Users} title="No customers had events in this period" />}
        />
      </Card>
    </div>
  );
}

function EventsReport({ data }) {
  const money = useMoney();
  const navigate = useNavigate();
  const { totals } = data;
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard label="Event revenue" icon={Wallet} value={money.format(totals.revenue)} meta={`${totals.events} events · ${money.format(totals.collected)} collected`} />
        <StatCard label="Event expenses" icon={Receipt} tone="danger" value={money.format(totals.expenses)} />
        <StatCard label="Event profit" icon={TrendingUp} tone="success" value={money.format(totals.profit)} danger={totals.profit < 0} />
        <StatCard label="Average margin" icon={Percent} tone="info" value={totals.margin === null ? '—' : `${totals.margin}%`} />
      </div>
      <Card>
        <CardHeader title="Profit per event" subtitle="Event value minus the expenses linked to it. Link costs to events on the Expenses page." />
        <DataTable
          columns={[
            { key: 'date', header: 'Date', render: (row) => <span className="nowrap">{formatDate(row.eventDate)}</span> },
            {
              key: 'event',
              header: 'Event',
              mobile: 'title',
              render: (row) => (
                <>
                  <div className="table-primary">{row.customer?.fullName}</div>
                  <div className="table-secondary">
                    {row.bookingNumber} · {labelOf(EVENT_TYPES, row.eventType)} · {row.hall?.name}
                  </div>
                </>
              ),
            },
            { key: 'revenue', header: 'Revenue', align: 'right', render: (row) => money.format(row.revenue) },
            { key: 'expenses', header: 'Expenses', align: 'right', render: (row) => money.format(row.expenses) },
            { key: 'profit', header: 'Profit', align: 'right', render: (row) => <span className={row.profit < 0 ? 'text-danger strong' : 'strong'}>{money.format(row.profit)}</span> },
            { key: 'margin', header: 'Margin', align: 'right', render: (row) => percent(row.margin, 1) },
            { key: 'payment', header: 'Payment', render: (row) => <PaymentStatusBadge status={row.paymentStatus} /> },
          ]}
          rows={data.events}
          onRowClick={(row) => navigate(`/bookings/${row._id}?tab=profit`)}
          empty={<EmptyState compact icon={CalendarCheck} title="No events in this period" />}
          footer={
            <tr>
              <td colSpan={2}>Total · {totals.events} events</td>
              <td className="num">{money.format(totals.revenue)}</td>
              <td className="num">{money.format(totals.expenses)}</td>
              <td className="num">{money.format(totals.profit)}</td>
              <td className="num">{percent(totals.margin, 1)}</td>
              <td />
            </tr>
          }
        />
      </Card>
    </div>
  );
}

function InventoryReport({ data }) {
  const money = useMoney();
  const navigate = useNavigate();
  const movementRows = Object.entries(data.movements).map(([type, row]) => ({ key: type, label: labelOf(INVENTORY_TRANSACTION_TYPES, type), value: row.cost, note: `${row.movements} entries` }));
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard label="Stock value" icon={Boxes} value={money.format(data.summary.stockValue)} meta={`${data.summary.items} active items`} />
        <StatCard label="Low stock" icon={TriangleAlert} tone="gold" value={formatNumber(data.summary.lowStock)} />
        <StatCard label="Out of stock" icon={Ban} tone="danger" value={formatNumber(data.summary.outOfStock)} />
        <StatCard label="Purchases in period" icon={PackageMinus} tone="info" value={money.format(data.summary.purchases)} />
      </div>
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHeader title="Needs restocking" actions={<Button size="sm" variant="ghost" to="/inventory?stockStatus=low_stock,out_of_stock">Open inventory</Button>} />
          <DataTable
            compact
            columns={[
              { key: 'name', header: 'Item', render: (row) => <span className="table-primary">{row.name}</span> },
              { key: 'qty', header: 'On hand', align: 'right', render: (row) => `${formatNumber(row.currentQuantity)} ${row.unit}` },
              { key: 'min', header: 'Minimum', align: 'right', render: (row) => formatNumber(row.minimumQuantity) },
              { key: 'status', header: '', render: (row) => <StockBadge status={row.stockStatus} /> },
            ]}
            rows={data.lowStock}
            onRowClick={(row) => navigate(`/inventory/${row._id}`)}
            empty={<EmptyState compact icon={CircleCheck} title="Everything is above its minimum" />}
          />
        </Card>
        <div className="stack">
          <Card>
            <CardHeader title="Stock movements in period" subtitle="Value of each kind of movement" />
            <CardBody>
              <BarList rows={movementRows} formatValue={money.format} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Most used items" subtitle="Stock out + damaged, by value" />
            <CardBody>
              <BarList rows={data.topConsumed.map((row) => ({ key: row.item._id, label: row.item.name, value: row.cost, note: `${formatNumber(row.quantity)} ${row.item.unit}` }))} formatValue={money.format} />
            </CardBody>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader title="Current stock" />
        <DataTable
          compact
          columns={[
            { key: 'name', header: 'Item', render: (row) => <span className="table-primary">{row.name}</span> },
            { key: 'sku', header: 'SKU', render: (row) => <span className="table-secondary">{row.sku}</span> },
            { key: 'category', header: 'Category' },
            { key: 'qty', header: 'On hand', align: 'right', render: (row) => `${formatNumber(row.currentQuantity)} ${row.unit}` },
            { key: 'cost', header: 'Cost / unit', align: 'right', render: (row) => money.format(row.costPerUnit) },
            { key: 'value', header: 'Value', align: 'right', render: (row) => money.format(row.value) },
            { key: 'status', header: 'Status', render: (row) => <StockBadge status={row.stockStatus} /> },
          ]}
          rows={data.stock}
          onRowClick={(row) => navigate(`/inventory/${row._id}`)}
        />
      </Card>
    </div>
  );
}

function OutstandingReport({ data }) {
  const money = useMoney();
  const navigate = useNavigate();
  const { totals } = data;
  return (
    <div className="stack">
      <div className="grid grid--4">
        <StatCard hero label="Total outstanding" icon={HandCoins} value={money.format(totals.amount)} meta={`${totals.count} bookings`} />
        <StatCard label="Overdue (event held)" icon={TriangleAlert} tone="danger" value={money.format(totals.overdueAmount)} danger={totals.overdueAmount > 0} meta={`${totals.overdueCount} bookings`} />
        <StatCard label="Due for upcoming events" icon={CalendarCheck} tone="gold" value={money.format(totals.amount - totals.overdueAmount)} meta={`${totals.count - totals.overdueCount} bookings`} />
        <StatCard label="Average per booking" icon={Wallet} tone="info" value={money.format(totals.count ? totals.amount / totals.count : 0)} />
      </div>
      <Card>
        <CardHeader title="Who owes money" subtitle="Oldest events first — overdue balances need a call" />
        <DataTable
          columns={[
            {
              key: 'date',
              header: 'Event date',
              render: (row) => (
                <>
                  <div className="nowrap">{formatDate(row.eventDate)}</div>
                  {row.daysOverdue > 0 && <Badge tone="danger">{row.daysOverdue} days overdue</Badge>}
                </>
              ),
            },
            {
              key: 'customer',
              header: 'Customer',
              mobile: 'title',
              render: (row) => (
                <>
                  <div className="table-primary">{row.customer?.fullName}</div>
                  <div className="table-secondary">
                    <a href={`tel:${row.customer?.phone}`} onClick={(event) => event.stopPropagation()}>
                      {row.customer?.phone}
                    </a>
                  </div>
                </>
              ),
            },
            { key: 'booking', header: 'Booking', render: (row) => <span className="table-secondary">{row.bookingNumber} · {row.hall?.name}</span> },
            { key: 'total', header: 'Total', align: 'right', render: (row) => money.format(row.totals.grandTotal) },
            { key: 'paid', header: 'Paid', align: 'right', render: (row) => money.format(row.totals.netPaid) },
            { key: 'balance', header: 'Balance', align: 'right', render: (row) => <span className="text-danger strong">{money.format(row.totals.balance)}</span> },
            { key: 'status', header: 'Status', render: (row) => <PaymentStatusBadge status={row.paymentStatus} /> },
          ]}
          rows={data.bookings}
          onRowClick={(row) => navigate(`/bookings/${row._id}?tab=payments`)}
          empty={<EmptyState compact icon={CircleCheck} title="Nobody owes money">Every booking is fully paid.</EmptyState>}
        />
      </Card>
    </div>
  );
}

export function ReportsPage() {
  const today = useToday();
  const { can } = useAuth();
  const hallOptions = useHallOptions();
  const [exporting, setExporting] = useState(null);
  const [params, setParams] = useListParams({ tab: 'financial', granularity: 'month', ...presetRange('last_12_months', today) });
  const report = REPORTS.find((entry) => entry.value === params.tab) ?? REPORTS[0];

  const usesRange = report.value !== 'outstanding';
  const usesGranularity = report.value === 'financial' || report.value === 'bookings';
  const usesScope = report.value !== 'customers' && report.value !== 'inventory';
  const usesPaymentStatus = report.value === 'events' || report.value === 'outstanding';

  const query = {
    ...(usesRange ? { from: params.from, to: params.to } : {}),
    ...(usesGranularity ? { granularity: params.granularity } : {}),
    ...(usesScope ? { hall: params.hall, eventType: params.eventType } : {}),
    ...(usesPaymentStatus ? { paymentStatus: params.paymentStatus } : {}),
  };
  const result = useQuery({ queryKey: ['reports', report.value, query], queryFn: () => reportsApi.get(report.value, query), placeholderData: keepPreviousData });

  const exportAs = async (formatName) => {
    setExporting(formatName);
    try {
      await downloadFile(`/reports/${report.value}`, { ...query, format: formatName });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setExporting(null);
    }
  };

  const body = (() => {
    if (result.isLoading) return <PageLoader />;
    if (result.isError) return <ErrorState error={result.error} onRetry={() => result.refetch()} />;
    const data = result.data;
    switch (report.value) {
      case 'bookings':
        return <BookingsReport data={data} granularity={params.granularity} />;
      case 'customers':
        return <CustomersReport data={data} />;
      case 'events':
        return <EventsReport data={data} />;
      case 'inventory':
        return <InventoryReport data={data} />;
      case 'outstanding':
        return <OutstandingReport data={data} />;
      default:
        return <FinancialReport data={data} />;
    }
  })();

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="How the business is doing — every figure comes from recorded payments, expenses and bookings"
        actions={
          can('reports.export') && (
            <>
              <Button icon={Sheet} loading={exporting === 'csv'} onClick={() => exportAs('csv')}>
                Excel (CSV)
              </Button>
              <Button icon={FileDown} loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}>
                PDF
              </Button>
            </>
          )
        }
      />
      <div className="stack">
        <Tabs tabs={REPORTS} value={report.value} onChange={(tab) => setParams({ tab })} />
        <div className="report-filters">
          {usesRange && <DateRangeFilter from={params.from || undefined} to={params.to || undefined} onChange={(range) => setParams(range)} allowAll={false} />}
          {usesGranularity && <Segmented label="Group by" options={GRANULARITIES} value={params.granularity} onChange={(granularity) => setParams({ granularity })} />}
          {usesScope && <FilterSelect label="Halls" value={params.hall} options={hallOptions} onChange={(hall) => setParams({ hall })} />}
          {usesScope && <FilterSelect label="Event types" value={params.eventType} options={toOptions(EVENT_TYPES)} onChange={(eventType) => setParams({ eventType })} />}
          {usesPaymentStatus && <FilterSelect label="Payment status" allLabel="Any payment status" value={params.paymentStatus} options={toOptions(PAYMENT_STATUSES)} onChange={(paymentStatus) => setParams({ paymentStatus })} />}
          {report.value === 'outstanding' && <span className="muted">Balances as of today</span>}
          {report.value === 'inventory' && (
            <span className="muted">
              Stock is as of today; the date range applies to movements. <Link to="/inventory">Manage stock</Link>
            </span>
          )}
        </div>
        <div className={result.isFetching && result.isPlaceholderData ? 'is-refreshing' : undefined}>{body}</div>
      </div>
    </>
  );
}
