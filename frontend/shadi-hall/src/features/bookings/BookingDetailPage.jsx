import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronDown, Clock, MapPin, Pencil, Phone, Users, CircleCheck, Undo2, Ban, PartyPopper, RotateCcw } from 'lucide-react';
import { bookingsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCollectPayment } from '@/features/payments/CollectPaymentProvider';
import { useApiMutation, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { formatDate, formatNumber, formatTimeRange } from '@/lib/format';
import { EVENT_TYPES, BOOKING_STATUS_TRANSITIONS, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Menu, MenuItem, Tabs, Avatar } from '@/components/ui/Controls';
import { Card, CardBody } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { HistoryTab, InvoicesTab, MoneyCard, OverviewTab, PaymentsTab, ProfitTab } from './detail/BookingTabs';

const STATUS_ACTIONS = {
  confirmed: { label: 'Confirm booking', icon: CircleCheck, message: 'The hall will be reserved for this event. This fails if another confirmed event overlaps.' },
  completed: { label: 'Mark as completed', icon: PartyPopper, message: 'Use this once the event has taken place.' },
  tentative: { label: 'Mark as tentative', icon: Undo2, message: 'The date stays held but the hall is no longer reserved.' },
  inquiry: { label: 'Move back to inquiry', icon: Undo2 },
  cancelled: { label: 'Cancel booking', icon: Ban, danger: true },
};

function StatusActions({ booking }) {
  const { can } = useAuth();
  const today = useToday();
  const confirm = useConfirm();
  const change = useApiMutation(({ status, reason }) => bookingsApi.changeStatus(booking._id, { status, reason }), {
    success: 'Booking updated',
    invalidate: [...MONEY_QUERY_KEYS, ['halls']],
  });
  if (!can('bookings.status')) return null;

  const eventPassed = String(booking.eventDate).slice(0, 10) <= today;
  const transitions = BOOKING_STATUS_TRANSITIONS[booking.status].filter((status) => status !== 'completed' || eventPassed);
  const primary = transitions.find((status) => status === 'confirmed' || status === 'completed');

  const run = async (status) => {
    const action = status === 'tentative' && booking.status === 'cancelled' ? { label: 'Reinstate booking', message: 'The booking comes back as tentative. Confirm it again to reserve the hall.' } : STATUS_ACTIONS[status];
    if (status === 'cancelled') {
      const reason = await confirm({
        title: 'Cancel this booking?',
        message: 'The booking and its payments are kept for the records. Record a refund separately if money is returned.',
        confirmLabel: 'Cancel booking',
        cancelLabel: 'Keep booking',
        danger: true,
        requireReason: true,
        reasonLabel: 'Why is it being cancelled?',
      });
      if (reason) change.mutate({ status, reason });
      return;
    }
    const ok = await confirm({ title: `${action.label}?`, message: action.message, confirmLabel: action.label });
    if (ok) change.mutate({ status });
  };

  return (
    <>
      {primary && (
        <Button variant="primary" icon={STATUS_ACTIONS[primary].icon} loading={change.isPending} onClick={() => run(primary)}>
          {STATUS_ACTIONS[primary].label}
        </Button>
      )}
      {transitions.filter((status) => status !== primary).length > 0 && (
        <Menu
          trigger={({ toggle }) => (
            <Button onClick={toggle}>
              More <ChevronDown size={15} aria-hidden />
            </Button>
          )}
        >
          {transitions
            .filter((status) => status !== primary)
            .map((status) => {
              const reinstate = status === 'tentative' && booking.status === 'cancelled';
              const action = STATUS_ACTIONS[status];
              return (
                <MenuItem key={status} icon={reinstate ? RotateCcw : action.icon} danger={action.danger} onClick={() => run(status)}>
                  {reinstate ? 'Reinstate booking' : action.label}
                </MenuItem>
              );
            })}
        </Menu>
      )}
    </>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const { can, canAny } = useAuth();
  const collect = useCollectPayment();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') ?? 'overview');
  const query = useQuery({ queryKey: ['bookings', id], queryFn: () => bookingsApi.get(id) });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const booking = query.data;
  const cancelled = booking.status === 'cancelled';

  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(can('payments.view') ? [{ value: 'payments', label: 'Payments' }] : []),
    ...(canAny('expenses.view', 'reports.view') ? [{ value: 'profit', label: 'Expenses & profit' }] : []),
    ...(can('invoices.view') ? [{ value: 'invoices', label: 'Invoices' }] : []),
    { value: 'history', label: 'History' },
  ];
  const selectTab = (value) => {
    setTab(value);
    setSearchParams(value === 'overview' ? {} : { tab: value }, { replace: true });
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Bookings', to: '/bookings' }, { label: booking.bookingNumber }]}
        title={
          <>
            {booking.customer.fullName}
            <BookingStatusBadge status={booking.status} />
            {can('payments.view') && !cancelled && <PaymentStatusBadge status={booking.paymentStatus} />}
          </>
        }
        subtitle={`${labelOf(EVENT_TYPES, booking.eventType)}${booking.title ? ` · ${booking.title}` : ''} · ${booking.bookingNumber}`}
        actions={
          <>
            {!cancelled && booking.totals.balance > 0 && can('payments.create') && (
              <Button variant="gold" onClick={() => collect({ bookingId: booking._id })}>
                Collect payment
              </Button>
            )}
            {!cancelled && can('bookings.update') && (
              <Button icon={Pencil} to={`/bookings/${booking._id}/edit`}>
                Edit
              </Button>
            )}
            <StatusActions booking={booking} />
          </>
        }
      />

      {cancelled && booking.cancellation?.reason && (
        <div className="alert alert--danger" style={{ marginBottom: 16 }}>
          <Ban size={18} aria-hidden />
          <div>
            <p className="alert__title">Cancelled on {formatDate(booking.cancellation.at)}</p>
            <div>
              {booking.cancellation.reason}
              {booking.cancellation.by?.name ? ` — ${booking.cancellation.by.name}` : ''}
            </div>
          </div>
        </div>
      )}

      <div className="booking-strip">
        <span>
          <CalendarDays size={16} aria-hidden /> {formatDate(booking.eventDate, 'EEE, d MMM yyyy')}
        </span>
        <span>
          <Clock size={16} aria-hidden /> {formatTimeRange(booking.startTime, booking.endTime)}
        </span>
        <span>
          <MapPin size={16} aria-hidden /> {booking.hall.name}
        </span>
        <span>
          <Users size={16} aria-hidden /> {formatNumber(booking.guestCount)} guests
        </span>
      </div>

      <div className="split split--aside-first">
        <div className="stack">
          <Tabs tabs={tabs} value={tab} onChange={selectTab} />
          {tab === 'overview' && <OverviewTab booking={booking} />}
          {tab === 'payments' && <PaymentsTab booking={booking} onCollect={() => collect({ bookingId: booking._id })} />}
          {tab === 'profit' && <ProfitTab booking={booking} />}
          {tab === 'invoices' && <InvoicesTab booking={booking} />}
          {tab === 'history' && <HistoryTab booking={booking} />}
        </div>
        <aside className="stack sticky-side">
          {can('payments.view') && <MoneyCard booking={booking} onCollect={() => collect({ bookingId: booking._id })} onRefund={() => collect({ bookingId: booking._id, mode: 'refund' })} />}
          <Card>
            <CardBody>
              <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                <Avatar name={booking.customer.fullName} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/customers/${booking.customer._id}`} className="strong" style={{ fontSize: 16 }}>
                    {booking.customer.fullName}
                  </Link>
                  <div className="secondary row" style={{ gap: 6 }}>
                    <Phone size={13} aria-hidden />
                    <a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a>
                  </div>
                  {booking.customer.alternatePhone && <div className="table-secondary">Alt: {booking.customer.alternatePhone}</div>}
                  {booking.customer.city && <div className="table-secondary">{[booking.customer.address, booking.customer.city].filter(Boolean).join(', ')}</div>}
                </div>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
