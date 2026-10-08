import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Pencil, Phone, Trash2, Mail, MapPin, IdCard, Wallet, CalendarCheck, HandCoins, TrendingUp } from 'lucide-react';
import { customersApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMoney, useApiMutation } from '@/lib/hooks';
import { formatDate, formatNumber, formatTimeRange, formatDateTime } from '@/lib/format';
import { EVENT_TYPES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatCard } from '@/components/ui/StatCard';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/Controls';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { CustomerFormDialog } from './CustomerFormDialog';

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const money = useMoney();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['customers', id], queryFn: () => customersApi.get(id) });
  const remove = useApiMutation(() => customersApi.remove(id), {
    success: 'Customer deleted',
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['customers', id] });
      navigate('/customers');
    },
    invalidate: [['customers']],
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const customer = query.data;
  const { stats } = customer;
  const showMoney = can('payments.view');

  const askDelete = async () => {
    const ok = await confirm({
      title: `Delete ${customer.fullName}?`,
      message: 'This can’t be undone. Customers with bookings can’t be deleted — they are kept for your records.',
      confirmLabel: 'Delete customer',
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Customers', to: '/customers' }, { label: customer.fullName }]}
        title={customer.fullName}
        subtitle={`Customer since ${formatDate(customer.createdAt, 'MMMM yyyy')}`}
        actions={
          <>
            {can('customers.delete') && stats.bookings + stats.cancelled === 0 && (
              <Button variant="ghost" icon={Trash2} onClick={askDelete}>
                Delete
              </Button>
            )}
            {can('customers.update') && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {can('bookings.create') && (
              <Button variant="primary" icon={CalendarPlus} to={`/bookings/new?customer=${customer._id}`}>
                New booking
              </Button>
            )}
          </>
        }
      />

      <div className="stack stack--lg">
        {showMoney && (
          <div className="grid grid--4">
            <StatCard label="Bookings" icon={CalendarCheck} value={formatNumber(stats.bookings)} meta={`${stats.upcoming} upcoming${stats.cancelled ? ` · ${stats.cancelled} cancelled` : ''}`} />
            <StatCard label="Total spent" icon={TrendingUp} tone="info" value={money.format(stats.totalBilled)} meta="Across non-cancelled bookings" />
            <StatCard label="Total paid" icon={Wallet} tone="success" value={money.format(stats.totalPaid)} />
            <StatCard label="Outstanding" icon={HandCoins} tone="gold" value={money.format(stats.outstanding)} danger={stats.outstanding > 0} />
          </div>
        )}

        <div className="split split--aside-first">
          <Card>
            <CardHeader title="Event history" subtitle={`${customer.bookings.length} booking${customer.bookings.length === 1 ? '' : 's'}`} />
            <DataTable
              columns={[
                {
                  key: 'date',
                  header: 'Date',
                  render: (row) => (
                    <>
                      <div className="table-primary nowrap">{formatDate(row.eventDate)}</div>
                      <div className="table-secondary nowrap">{formatTimeRange(row.startTime, row.endTime)}</div>
                    </>
                  ),
                },
                {
                  key: 'event',
                  header: 'Event',
                  render: (row) => (
                    <>
                      <div>{labelOf(EVENT_TYPES, row.eventType)}</div>
                      <div className="table-secondary">
                        {row.bookingNumber} · {row.hall?.name}
                      </div>
                    </>
                  ),
                },
                { key: 'guests', header: 'Guests', align: 'right', render: (row) => formatNumber(row.guestCount) },
                ...(showMoney
                  ? [
                      { key: 'total', header: 'Total', align: 'right', render: (row) => money.format(row.totals.grandTotal) },
                      { key: 'paid', header: 'Paid', align: 'right', render: (row) => money.format(row.totals.netPaid) },
                      {
                        key: 'balance',
                        header: 'Remaining',
                        align: 'right',
                        render: (row) => (row.status === 'cancelled' ? '—' : row.totals.balance > 0 ? <span className="text-danger strong">{money.format(row.totals.balance)}</span> : <span className="text-success">Paid</span>),
                      },
                    ]
                  : []),
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <div className="stack stack--sm" style={{ gap: 4, alignItems: 'flex-start' }}>
                      <BookingStatusBadge status={row.status} />
                      {showMoney && row.status !== 'cancelled' && <PaymentStatusBadge status={row.paymentStatus} />}
                    </div>
                  ),
                },
              ]}
              rows={customer.bookings}
              onRowClick={(row) => navigate(`/bookings/${row._id}`)}
              empty={<EmptyState compact icon={CalendarPlus} title="No bookings yet" />}
            />
          </Card>
          <aside className="stack">
            <Card>
              <CardBody>
                <div className="stack">
                  <div className="row" style={{ gap: 12 }}>
                    <Avatar name={customer.fullName} size="lg" />
                    <div>
                      <div className="strong" style={{ fontSize: 17 }}>
                        {customer.fullName}
                      </div>
                      <div className="muted">{customer.city}</div>
                    </div>
                  </div>
                  <dl className="details">
                    <dt>
                      <Phone size={14} aria-hidden /> Phone
                    </dt>
                    <dd>
                      <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                      {customer.alternatePhone && <div className="table-secondary">{customer.alternatePhone}</div>}
                    </dd>
                    {customer.email && (
                      <>
                        <dt>
                          <Mail size={14} aria-hidden /> Email
                        </dt>
                        <dd>
                          <a href={`mailto:${customer.email}`}>{customer.email}</a>
                        </dd>
                      </>
                    )}
                    {customer.cnic && (
                      <>
                        <dt>
                          <IdCard size={14} aria-hidden /> CNIC
                        </dt>
                        <dd>{customer.cnic}</dd>
                      </>
                    )}
                    {customer.address && (
                      <>
                        <dt>
                          <MapPin size={14} aria-hidden /> Address
                        </dt>
                        <dd>{customer.address}</dd>
                      </>
                    )}
                    <dt>Updated</dt>
                    <dd>{formatDateTime(customer.updatedAt)}</dd>
                  </dl>
                  {customer.notes && <p className="secondary" style={{ whiteSpace: 'pre-wrap' }}>{customer.notes}</p>}
                </div>
              </CardBody>
            </Card>
          </aside>
        </div>
      </div>
      <CustomerFormDialog open={editing} onClose={() => setEditing(false)} customer={customer} />
    </>
  );
}
