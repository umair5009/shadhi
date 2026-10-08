import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Ban, ChevronDown, HandCoins, Printer, Undo2, Wallet } from 'lucide-react';
import { paymentsApi } from '@/api/endpoints';
import { fileUrl } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCollectPayment } from './CollectPaymentProvider';
import { useApiMutation, useListParams, useMoney, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { presetRange } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { PAYMENT_METHODS, PAYMENT_TYPES, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { Menu, MenuItem, SearchInput } from '@/components/ui/Controls';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { Checkbox } from '@/components/form/Field';
import { DateRangeFilter, FilterSelect } from '@/components/ui/Filters';
import { useConfirm } from '@/components/ui/ConfirmProvider';

export function PaymentsPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const today = useToday();
  const confirm = useConfirm();
  const { can } = useAuth();
  const collect = useCollectPayment();
  const [params, setParams] = useListParams({ page: 1, ...presetRange('this_month', today) });

  const query = {
    page: params.page,
    limit: 25,
    sort: params.sort,
    q: params.q,
    method: params.method,
    type: params.type,
    from: params.from,
    to: params.to,
    includeVoided: params.includeVoided,
  };
  const payments = useQuery({ queryKey: ['payments', 'list', query], queryFn: () => paymentsApi.list(query), placeholderData: keepPreviousData });
  const voidPayment = useApiMutation(({ id, reason }) => paymentsApi.void(id, { reason }), { success: 'Payment voided', invalidate: MONEY_QUERY_KEYS });
  const summary = payments.data?.summary;

  const askVoid = async (payment) => {
    const reason = await confirm({
      title: `Void ${payment.receiptNumber}?`,
      message: `${money.format(payment.amount)} from ${payment.customer?.fullName} will stop counting towards booking ${payment.booking?.bookingNumber}. The entry stays in the ledger marked as void.`,
      confirmLabel: 'Void payment',
      danger: true,
      requireReason: true,
    });
    if (reason) voidPayment.mutate({ id: payment._id, reason });
  };

  const columns = [
    { key: 'paidOn', header: 'Date', sortKey: 'paidOn', render: (row) => <span className="nowrap">{formatDate(row.paidOn)}</span> },
    { key: 'receiptNumber', header: 'Receipt', sortKey: 'receiptNumber', render: (row) => <span className="table-primary nowrap">{row.receiptNumber}</span> },
    {
      key: 'customer',
      header: 'Customer',
      mobile: 'title',
      render: (row) => (
        <>
          <div className="table-primary">{row.customer?.fullName}</div>
          <div className="table-secondary">
            {row.booking?.bookingNumber} · {formatDate(row.booking?.eventDate)}
          </div>
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
    { key: 'receivedBy', header: 'Received by', render: (row) => <span className="table-secondary">{row.receivedBy?.name}</span> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortKey: 'amount',
      render: (row) => <span className={row.type === 'refund' ? 'text-danger strong' : 'strong'}>{row.type === 'refund' ? '− ' : ''}{money.format(row.amount)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row row--end" style={{ flexWrap: 'nowrap' }} onClick={(event) => event.stopPropagation()}>
          <IconButton icon={Printer} label="Print receipt" size="sm" variant="ghost" onClick={() => window.open(fileUrl(`/payments/${row._id}/receipt.pdf`), '_blank', 'noopener')} />
          {!row.void && can('payments.void') && <IconButton icon={Ban} label="Void" size="sm" variant="ghost" onClick={() => askVoid(row)} />}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Every rupee received and refunded. Payments can’t be edited — mistakes are voided with a reason."
        actions={
          <>
            {can('payments.refund') && (
              <Menu
                trigger={({ toggle }) => (
                  <Button onClick={toggle}>
                    More <ChevronDown size={15} aria-hidden />
                  </Button>
                )}
              >
                <MenuItem icon={Undo2} onClick={() => collect({ mode: 'refund' })}>
                  Record a refund
                </MenuItem>
              </Menu>
            )}
            {can('payments.create') && (
              <Button variant="gold" icon={HandCoins} onClick={() => collect()}>
                Collect payment
              </Button>
            )}
          </>
        }
      />
      <div className="stack">
        <div className="grid grid--3">
          <StatCard label="Received" icon={Wallet} tone="success" value={money.format(summary?.received ?? 0)} loading={payments.isLoading} meta={`${summary?.count ?? 0} entries in this view`} />
          <StatCard label="Refunded" icon={Undo2} tone="danger" value={money.format(summary?.refunded ?? 0)} loading={payments.isLoading} />
          <StatCard label="Net collected" icon={HandCoins} tone="gold" value={money.format(summary?.net ?? 0)} loading={payments.isLoading} />
        </div>
        <Card>
          <div className="toolbar">
            <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search receipt, customer, booking or reference" />
            <FilterSelect label="Methods" allLabel="All methods" value={params.method} options={toOptions(PAYMENT_METHODS)} onChange={(method) => setParams({ method })} />
            <FilterSelect label="Types" allLabel="All types" value={params.type} options={toOptions(PAYMENT_TYPES)} onChange={(type) => setParams({ type })} />
            <DateRangeFilter from={params.from} to={params.to} onChange={(range) => setParams(range)} />
            <Checkbox label="Show voided" checked={params.includeVoided === 'true'} onChange={(checked) => setParams({ includeVoided: checked ? 'true' : undefined })} />
          </div>
          <DataTable
            columns={columns}
            rows={payments.data?.data}
            loading={payments.isLoading}
            refreshing={payments.isFetching && !payments.isLoading}
            error={payments.error}
            onRetry={() => payments.refetch()}
            sort={params.sort}
            onSortChange={(sort) => setParams({ sort })}
            onRowClick={(row) => navigate(`/bookings/${row.booking?._id}?tab=payments`)}
            rowClassName={(row) => (row.void ? 'row--voided' : undefined)}
            empty={<EmptyState icon={Wallet} title="No payments in this period">Change the date range, or collect a payment.</EmptyState>}
          />
          <Pagination meta={payments.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
      </div>
    </>
  );
}
