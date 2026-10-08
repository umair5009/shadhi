import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, FileText, Plus, Printer, Receipt, TrendingUp } from 'lucide-react';
import { auditApi, bookingsApi, invoicesApi, paymentsApi } from '@/api/endpoints';
import { fileUrl } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { ExpenseFormDialog } from '@/features/expenses/ExpenseFormDialog';
import { useApiMutation, useMoney } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { formatDate, formatDateTime, formatNumber, formatRelative, formatTimeRange, percent } from '@/lib/format';
import { EVENT_TYPES, MENU_UNITS, PAYMENT_METHODS, PAYMENT_TYPES, BOOKING_STATUSES, labelOf } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, QueryBoundary } from '@/components/ui/Feedback';
import { ProgressBar } from '@/components/ui/Controls';
import { StatCard } from '@/components/ui/StatCard';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { BarList } from '@/components/charts/Charts';
import { SERIES_COLORS } from '@/components/charts/seriesColors';

export function MoneyCard({ booking, onCollect, onRefund }) {
  const money = useMoney();
  const { can } = useAuth();
  const { totals } = booking;
  const cancelled = booking.status === 'cancelled';
  const settled = totals.balance <= 0;
  return (
    <Card>
      <CardHeader title="Money" subtitle={cancelled ? 'Booking cancelled — nothing more is owed' : undefined} />
      <CardBody>
        <div className="stack">
          <div className="money-summary">
            <div className="money-summary__row">
              <span>Grand total</span>
              <span className="strong">{money.format(totals.grandTotal)}</span>
            </div>
            <div className="money-summary__row">
              <span>Received</span>
              <span className="text-success">{money.format(totals.paid)}</span>
            </div>
            {totals.refunded > 0 && (
              <div className="money-summary__row">
                <span>Refunded</span>
                <span className="text-danger">− {money.format(totals.refunded)}</span>
              </div>
            )}
            {!cancelled && (
              <div className={`money-summary__row money-summary__row--balance${settled ? ' money-summary__row--settled' : ''}`}>
                <span>{settled ? 'Fully paid' : 'Remaining'}</span>
                <span>{money.format(Math.max(0, totals.balance))}</span>
              </div>
            )}
          </div>
          {!cancelled && totals.grandTotal > 0 && (
            <div className="stack stack--sm">
              <ProgressBar value={totals.netPaid} max={totals.grandTotal} tone={settled ? 'success' : 'warning'} label="Paid so far" />
              <span className="field__hint">{percent((totals.netPaid / totals.grandTotal) * 100)} paid</span>
            </div>
          )}
          <div className="row">
            {!cancelled && !settled && can('payments.create') && (
              <Button variant="gold" onClick={onCollect} block>
                Collect payment
              </Button>
            )}
            {totals.netPaid > 0 && can('payments.refund') && (
              <Button variant="ghost" size="sm" onClick={onRefund}>
                Record a refund
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function OverviewTab({ booking }) {
  const money = useMoney();
  const { can } = useAuth();
  const { menu, totals } = booking;
  const included = menu.items.filter((item) => item.source === 'package');
  const priced = menu.items.filter((item) => item.source !== 'package');

  return (
    <div className="stack">
      <Card>
        <CardHeader title="Event details" />
        <CardBody>
          <dl className="details">
            <dt>Event</dt>
            <dd>
              {labelOf(EVENT_TYPES, booking.eventType)}
              {booking.title ? ` — ${booking.title}` : ''}
            </dd>
            <dt>Date</dt>
            <dd>{formatDate(booking.eventDate, 'EEEE, d MMMM yyyy')}</dd>
            <dt>Time</dt>
            <dd>{formatTimeRange(booking.startTime, booking.endTime)}</dd>
            <dt>Hall</dt>
            <dd>
              <span className="hall-chip" style={{ fontSize: 'inherit' }}>
                <span className="color-dot" style={{ background: booking.hall?.color }} aria-hidden />
                <Link to={`/halls/${booking.hall?._id}`}>{booking.hall?.name}</Link>
              </span>
              {booking.guestCount > booking.hall?.capacity && <Badge tone="warning" style={{ marginLeft: 8 }}>Over capacity ({formatNumber(booking.hall.capacity)})</Badge>}
            </dd>
            <dt>Guests</dt>
            <dd>{formatNumber(booking.guestCount)}</dd>
            {booking.notes && (
              <>
                <dt>Notes</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{booking.notes}</dd>
              </>
            )}
            <dt>Booked by</dt>
            <dd>
              {booking.createdBy?.name ?? '—'} · {formatDateTime(booking.createdAt)}
            </dd>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Menu"
          subtitle={menu.mode === 'package' ? `${menu.package?.name} package · ${money.format(menu.package?.rate)}${menu.package?.pricingType === 'per_person' ? ' per person' : ' fixed'}` : menu.mode === 'custom' ? 'Custom menu' : 'No food from the hall'}
        />
        {menu.mode !== 'none' && (
          <CardBody>
            <div className="stack">
              {included.length > 0 && (
                <div className="tag-list">
                  {included.map((item) => (
                    <Badge key={item._id} tone="gold">
                      {item.name}
                    </Badge>
                  ))}
                </div>
              )}
              {priced.length > 0 && (
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>{menu.mode === 'package' ? 'Extras' : 'Dish'}</th>
                      <th className="num">Qty</th>
                      <th className="num">Price</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priced.map((item) => (
                      <tr key={item._id}>
                        <td>
                          {item.name} <span className="table-secondary">{labelOf(MENU_UNITS, item.unit)}</span>
                        </td>
                        <td className="num">{formatNumber(item.quantity)}</td>
                        <td className="num">{money.format(item.unitPrice)}</td>
                        <td className="num">{money.format(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {menu.notes && <p className="secondary">{menu.notes}</p>}
            </div>
          </CardBody>
        )}
      </Card>

      {can('payments.view') && (
        <Card>
          <CardHeader title="Charges" />
          <CardBody flush>
            <table className="table">
              <tbody>
                <tr>
                  <td>Hall charges</td>
                  <td className="num">{money.format(totals.hall)}</td>
                </tr>
                <tr>
                  <td>Menu</td>
                  <td className="num">{money.format(totals.menu)}</td>
                </tr>
                {booking.services.map((service) => (
                  <tr key={service._id}>
                    <td>
                      {service.name}
                      {service.quantity !== 1 && <span className="table-secondary"> · {formatNumber(service.quantity)} × {money.format(service.unitPrice)}</span>}
                    </td>
                    <td className="num">{money.format(service.total)}</td>
                  </tr>
                ))}
                {totals.decoration > 0 && (
                  <tr>
                    <td>Decoration</td>
                    <td className="num">{money.format(totals.decoration)}</td>
                  </tr>
                )}
                {totals.other > 0 && (
                  <tr>
                    <td>Other charges</td>
                    <td className="num">{money.format(totals.other)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td>Subtotal</td>
                  <td className="num">{money.format(totals.subtotal)}</td>
                </tr>
                {totals.discount > 0 && (
                  <tr>
                    <td>Discount</td>
                    <td className="num text-success">− {money.format(totals.discount)}</td>
                  </tr>
                )}
                {totals.tax > 0 && (
                  <tr>
                    <td>Tax ({booking.charges.taxRate}%)</td>
                    <td className="num">{money.format(totals.tax)}</td>
                  </tr>
                )}
                <tr>
                  <td>Grand total</td>
                  <td className="num">{money.format(totals.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export function PaymentsTab({ booking, onCollect }) {
  const money = useMoney();
  const { can } = useAuth();
  const confirm = useConfirm();
  const payments = useQuery({
    queryKey: ['payments', 'booking', booking._id],
    queryFn: () => paymentsApi.list({ booking: booking._id, includeVoided: true, limit: 100, sort: 'paidOn' }),
  });
  const voidPayment = useApiMutation(({ id, reason }) => paymentsApi.void(id, { reason }), { success: 'Payment voided', invalidate: MONEY_QUERY_KEYS });

  const askVoid = async (payment) => {
    const reason = await confirm({
      title: `Void ${payment.receiptNumber}?`,
      message: `${money.format(payment.amount)} will no longer count towards this booking. The record stays in the history.`,
      confirmLabel: 'Void payment',
      danger: true,
      requireReason: true,
    });
    if (reason) voidPayment.mutate({ id: payment._id, reason });
  };

  const columns = [
    { key: 'paidOn', header: 'Date', render: (row) => formatDate(row.paidOn) },
    {
      key: 'receipt',
      header: 'Receipt',
      render: (row) => (
        <>
          <div className="table-primary">{row.receiptNumber}</div>
          <div className="table-secondary">by {row.receivedBy?.name}</div>
        </>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (row.void ? <Badge tone="danger">Void</Badge> : <Badge tone={row.type === 'refund' ? 'danger' : row.type === 'final' ? 'success' : 'neutral'}>{labelOf(PAYMENT_TYPES, row.type)}</Badge>),
    },
    {
      key: 'method',
      header: 'Method',
      render: (row) => (
        <>
          {labelOf(PAYMENT_METHODS, row.method)}
          {row.reference && <div className="table-secondary">{row.reference}</div>}
        </>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => <span className={row.type === 'refund' ? 'text-danger strong' : 'strong'}>{row.type === 'refund' ? '− ' : ''}{money.format(row.amount)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row row--end" style={{ flexWrap: 'nowrap' }}>
          <IconButton icon={Printer} label="Print receipt" size="sm" variant="ghost" onClick={() => window.open(fileUrl(`/payments/${row._id}/receipt.pdf`), '_blank', 'noopener')} />
          {!row.void && can('payments.void') && <IconButton icon={Ban} label="Void payment" size="sm" variant="ghost" onClick={() => askVoid(row)} />}
        </div>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Payment history"
        subtitle={payments.data ? `${money.format(payments.data.summary.net)} received in ${payments.data.summary.count} entr${payments.data.summary.count === 1 ? 'y' : 'ies'}` : undefined}
        actions={booking.status !== 'cancelled' && booking.totals.balance > 0 && can('payments.create') && <Button variant="gold" size="sm" onClick={onCollect}>Collect payment</Button>}
      />
      <DataTable
        columns={columns}
        rows={payments.data?.data}
        loading={payments.isLoading}
        error={payments.error}
        rowClassName={(row) => (row.void ? 'row--voided' : undefined)}
        empty={<EmptyState compact icon={Receipt} title="No payments yet">The advance and every installment will be listed here.</EmptyState>}
      />
    </Card>
  );
}

export function ProfitTab({ booking }) {
  const money = useMoney();
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const profit = useQuery({ queryKey: ['bookings', booking._id, 'profitability'], queryFn: () => bookingsApi.profitability(booking._id) });

  return (
    <QueryBoundary query={profit}>
      {(data) => (
        <div className="stack">
          <div className="grid grid--4">
            <StatCard label="Event revenue" value={money.format(data.revenue)} icon={TrendingUp} meta={`${money.format(data.collected)} collected`} />
            <StatCard label="Event expenses" value={money.format(data.totalExpenses)} icon={Receipt} tone="danger" meta={`${data.expenses.length} entr${data.expenses.length === 1 ? 'y' : 'ies'}`} />
            <StatCard label="Event profit" value={money.format(data.profit)} icon={TrendingUp} tone="success" danger={data.profit < 0} />
            <StatCard label="Margin" value={data.margin === null ? '—' : `${data.margin}%`} icon={TrendingUp} tone="info" />
          </div>
          <div className="grid grid--2" style={{ alignItems: 'start' }}>
            <Card>
              <CardHeader title="Costs by category" />
              <CardBody>
                <BarList rows={data.byCategory.map((row) => ({ key: row.name, label: row.name, value: row.total }))} formatValue={money.format} color={SERIES_COLORS.expenses} emptyText="No costs recorded for this event" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Expenses for this event"
                actions={
                  can('expenses.create') && (
                    <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
                      Add expense
                    </Button>
                  )
                }
              />
              {data.expenses.length === 0 ? (
                <EmptyState compact icon={Receipt} title="No expenses linked yet">
                  Add food purchases, decoration, extra staff… to see the real profit of this event.
                </EmptyState>
              ) : (
                <ul className="list-plain">
                  {data.expenses.map((expense) => (
                    <li key={expense._id} className="list-row">
                      <div className="list-row__main">
                        <div className="table-primary">{expense.description}</div>
                        <div className="table-secondary">
                          {expense.expenseNumber} · {expense.category?.name} · {formatDate(expense.date)}
                        </div>
                      </div>
                      <span className="strong tabular">{money.format(expense.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <ExpenseFormDialog open={adding} onClose={() => setAdding(false)} booking={booking} />
        </div>
      )}
    </QueryBoundary>
  );
}

export function InvoicesTab({ booking }) {
  const money = useMoney();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const invoices = useQuery({ queryKey: ['invoices', 'booking', booking._id], queryFn: () => invoicesApi.list({ booking: booking._id, limit: 50 }) });
  const current = invoices.data?.data.find((invoice) => invoice.status === 'issued');

  const generate = async () => {
    if (current) {
      const ok = await confirm({
        title: 'Replace the current invoice?',
        message: `${current.invoiceNumber} will be marked void and a new invoice with the latest charges and payments will be issued.`,
        confirmLabel: 'Issue new invoice',
      });
      if (!ok) return;
    }
    setCreating(true);
    try {
      const invoice = await invoicesApi.create({ booking: booking._id, replace: Boolean(current) });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Invoice ${invoice.invoiceNumber} issued`);
      navigate(`/invoices/${invoice._id}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Invoices"
        actions={
          can('invoices.create') &&
          booking.status !== 'cancelled' && (
            <Button size="sm" variant="primary" icon={FileText} loading={creating} onClick={generate}>
              {current ? 'Regenerate invoice' : 'Generate invoice'}
            </Button>
          )
        }
      />
      <DataTable
        columns={[
          { key: 'invoiceNumber', header: 'Invoice', render: (row) => <span className="table-primary">{row.invoiceNumber}</span> },
          { key: 'issueDate', header: 'Issued', render: (row) => formatDate(row.issueDate) },
          { key: 'total', header: 'Amount', align: 'right', render: (row) => money.format(row.snapshot.totals.grandTotal) },
          { key: 'status', header: 'Status', render: (row) => (row.status === 'void' ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Issued</Badge>) },
        ]}
        rows={invoices.data?.data}
        loading={invoices.isLoading}
        error={invoices.error}
        onRowClick={(row) => navigate(`/invoices/${row._id}`)}
        rowClassName={(row) => (row.status === 'void' ? 'row--voided' : undefined)}
        empty={<EmptyState compact icon={FileText} title="No invoice yet">Generate one to print or send to the customer.</EmptyState>}
      />
    </Card>
  );
}

export function HistoryTab({ booking }) {
  const audit = useQuery({ queryKey: ['audit', 'booking', booking._id], queryFn: () => auditApi.list({ entityKind: 'booking', entityId: booking._id, limit: 50 }) });
  return (
    <div className="grid grid--2" style={{ alignItems: 'start' }}>
      <Card>
        <CardHeader title="Status changes" />
        <CardBody>
          <ol className="timeline">
            {[...booking.statusHistory].reverse().map((entry, index) => (
              <li key={index} className="timeline__item">
                <span className="timeline__dot" aria-hidden />
                <div className="timeline__body">
                  <div className="strong">
                    {entry.from ? `${labelOf(BOOKING_STATUSES, entry.from)} → ` : ''}
                    {labelOf(BOOKING_STATUSES, entry.to)}
                  </div>
                  {entry.note && <div className="secondary">{entry.note}</div>}
                  <div className="timeline__meta">
                    {entry.by?.name ?? 'System'} · {formatDateTime(entry.at)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change log" subtitle="Who changed what on this booking" />
        <QueryBoundary query={audit}>
          {(data) =>
            data.data.length === 0 ? (
              <EmptyState compact title="No changes recorded" />
            ) : (
              <ul className="list-plain">
                {data.data.map((entry) => (
                  <li key={entry._id} className="list-row" style={{ alignItems: 'flex-start' }}>
                    <div className="list-row__main">
                      <div>{entry.summary}</div>
                      {entry.changes?.after && entry.action === 'booking.updated' && (
                        <div className="table-secondary">Changed: {Object.keys(entry.changes.after).join(', ')}</div>
                      )}
                      <div className="table-secondary">
                        {entry.actorName} · {formatRelative(entry.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryBoundary>
      </Card>
    </div>
  );
}
