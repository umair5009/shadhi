import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, Plus } from 'lucide-react';
import { bookingsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHallOptions } from '@/features/halls/useHalls';
import { useListParams, useMoney } from '@/lib/hooks';
import { formatDate, formatNumber, formatTimeRange } from '@/lib/format';
import { EVENT_TYPES, PAYMENT_STATUSES, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Tabs } from '@/components/ui/Controls';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { DateRangeFilter, FilterSelect } from '@/components/ui/Filters';

const TABS = [
  { value: 'all', label: 'All', params: {} },
  { value: 'upcoming', label: 'Upcoming', params: { upcoming: true } },
  { value: 'due', label: 'Money due', params: { hasBalance: true } },
  { value: 'pending', label: 'Inquiries & holds', params: { status: 'inquiry,tentative' } },
  { value: 'completed', label: 'Completed', params: { status: 'completed' } },
  { value: 'cancelled', label: 'Cancelled', params: { status: 'cancelled' } },
];

const DEFAULTS = { tab: 'all', page: 1 };

export function BookingsPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const { can } = useAuth();
  const hallOptions = useHallOptions();
  const [params, setParams] = useListParams(DEFAULTS);
  const tab = TABS.find((entry) => entry.value === params.tab) ?? TABS[0];
  const showMoney = can('payments.view');

  const query = {
    page: params.page,
    limit: 20,
    sort: params.sort,
    q: params.q,
    hall: params.hall,
    eventType: params.eventType,
    paymentStatus: params.paymentStatus,
    from: params.from,
    to: params.to,
    ...tab.params,
  };
  const bookings = useQuery({ queryKey: ['bookings', 'list', query], queryFn: () => bookingsApi.list(query), placeholderData: keepPreviousData });

  const columns = [
    {
      key: 'event',
      header: 'Event date',
      sortKey: 'eventDate',
      render: (row) => (
        <>
          <div className="table-primary nowrap">{formatDate(row.eventDate, 'EEE, dd MMM yyyy')}</div>
          <div className="table-secondary nowrap">{formatTimeRange(row.startTime, row.endTime)}</div>
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
            {row.bookingNumber} · {row.customer?.phone}
          </div>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Event',
      render: (row) => (
        <>
          <div>{labelOf(EVENT_TYPES, row.eventType)}</div>
          <div className="hall-chip">
            <span className="color-dot" style={{ background: row.hall?.color }} aria-hidden />
            {row.hall?.name}
          </div>
        </>
      ),
    },
    { key: 'guestCount', header: 'Guests', align: 'right', sortKey: 'guestCount', render: (row) => formatNumber(row.guestCount) },
    ...(showMoney
      ? [
          { key: 'total', header: 'Total', align: 'right', sortKey: 'grandTotal', render: (row) => money.format(row.totals.grandTotal) },
          { key: 'paid', header: 'Paid', align: 'right', render: (row) => <span className="text-success">{money.format(row.totals.netPaid)}</span> },
          {
            key: 'balance',
            header: 'Remaining',
            align: 'right',
            sortKey: 'balance',
            render: (row) =>
              row.status === 'cancelled' ? (
                <span className="muted">—</span>
              ) : row.totals.balance > 0 ? (
                <span className="text-danger strong">{money.format(row.totals.balance)}</span>
              ) : (
                <span className="text-success strong">Paid</span>
              ),
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="stack stack--sm" style={{ alignItems: 'flex-start', gap: 4 }}>
          <BookingStatusBadge status={row.status} />
          {showMoney && row.status !== 'cancelled' && <PaymentStatusBadge status={row.paymentStatus} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Every event — inquiries, holds, confirmed and past"
        actions={
          <>
            <Button icon={CalendarDays} to="/calendar">
              Calendar
            </Button>
            {can('bookings.create') && (
              <Button variant="primary" icon={Plus} to="/bookings/new">
                New booking
              </Button>
            )}
          </>
        }
      />
      <Card>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} value={tab.value} onChange={(value) => setParams({ tab: value, sort: undefined })} />
        </div>
        <div className="toolbar">
          <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search customer, phone or booking no." />
          <FilterSelect label="Halls" value={params.hall} options={hallOptions} onChange={(hall) => setParams({ hall })} />
          <FilterSelect label="Event types" value={params.eventType} options={toOptions(EVENT_TYPES)} onChange={(eventType) => setParams({ eventType })} />
          {showMoney && <FilterSelect label="Payment status" allLabel="Any payment status" value={params.paymentStatus} options={toOptions(PAYMENT_STATUSES)} onChange={(paymentStatus) => setParams({ paymentStatus })} />}
          <DateRangeFilter from={params.from} to={params.to} onChange={(range) => setParams(range)} />
        </div>
        <DataTable
          columns={columns}
          rows={bookings.data?.data}
          loading={bookings.isLoading}
          refreshing={bookings.isFetching && !bookings.isLoading}
          error={bookings.error}
          onRetry={() => bookings.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          onRowClick={(row) => navigate(`/bookings/${row._id}`)}
          empty={
            <EmptyState icon={CalendarPlus} title="No bookings found" action={can('bookings.create') && <Button variant="primary" icon={Plus} to="/bookings/new">New booking</Button>}>
              Try a different filter, or create the first booking.
            </EmptyState>
          }
        />
        <Pagination meta={bookings.data?.meta} onPageChange={(page) => setParams({ page })} />
      </Card>
    </>
  );
}
