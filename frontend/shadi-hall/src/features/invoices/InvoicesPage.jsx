import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Plus } from 'lucide-react';
import { invoicesApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { BookingPicker } from '@/features/bookings/BookingPicker';
import { useListParams, useMoney } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Tabs } from '@/components/ui/Controls';
import { Badge, PaymentStatusBadge } from '@/components/ui/Badge';
import { EmptyState, Alert } from '@/components/ui/Feedback';
import { DateRangeFilter } from '@/components/ui/Filters';

const TABS = [
  { value: 'all', label: 'All', params: {} },
  { value: 'unpaid', label: 'Unpaid', params: { status: 'issued', paymentStatus: 'unpaid,partial' } },
  { value: 'paid', label: 'Paid', params: { status: 'issued', paymentStatus: 'paid,overpaid' } },
  { value: 'void', label: 'Void', params: { status: 'void' } },
];

function GenerateInvoiceDialog({ open, onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [booking, setBooking] = useState(null);
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setBooking(null);
    setExisting(null);
    onClose();
  };

  const generate = async (replace = false) => {
    setBusy(true);
    try {
      const invoice = await invoicesApi.create({ booking: booking._id, replace });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Invoice ${invoice.invoiceNumber} issued`);
      close();
      navigate(`/invoices/${invoice._id}`);
    } catch (error) {
      if (error.code === 'INVOICE_EXISTS') setExisting(error.details?.[0]);
      else toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Generate invoice"
      description="The invoice captures the booking’s current charges. Payments update on it automatically."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {existing ? (
            <Button variant="primary" loading={busy} onClick={() => generate(true)}>
              Replace {existing.invoiceNumber}
            </Button>
          ) : (
            <Button variant="primary" disabled={!booking} loading={busy} onClick={() => generate(false)}>
              Generate
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        <BookingPicker
          value={booking}
          onChange={(value) => {
            setBooking(value);
            setExisting(null);
          }}
          filters={{ status: 'inquiry,tentative,confirmed,completed' }}
        />
        {existing && (
          <Alert tone="warning" title={`${existing.invoiceNumber} already exists for this booking`}>
            Replacing it marks the old invoice as void and issues a new number.
          </Alert>
        )}
      </div>
    </Dialog>
  );
}

export function InvoicesPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useListParams({ tab: 'all', page: 1 });
  const tab = TABS.find((entry) => entry.value === params.tab) ?? TABS[0];

  const query = { page: params.page, limit: 20, sort: params.sort, q: params.q, from: params.from, to: params.to, ...tab.params };
  const invoices = useQuery({ queryKey: ['invoices', 'list', query], queryFn: () => invoicesApi.list(query), placeholderData: keepPreviousData });

  const columns = [
    { key: 'invoiceNumber', header: 'Invoice', sortKey: 'invoiceNumber', render: (row) => <span className="table-primary nowrap">{row.invoiceNumber}</span> },
    {
      key: 'customer',
      header: 'Customer',
      mobile: 'title',
      render: (row) => (
        <>
          <div className="table-primary">{row.snapshot.customer.fullName}</div>
          <div className="table-secondary">
            {row.snapshot.event.bookingNumber} · {row.snapshot.event.eventTypeLabel} · {formatDate(row.snapshot.event.eventDate)}
          </div>
        </>
      ),
    },
    { key: 'issueDate', header: 'Issued', sortKey: 'issueDate', render: (row) => <span className="nowrap">{formatDate(row.issueDate)}</span> },
    { key: 'dueDate', header: 'Due', sortKey: 'dueDate', render: (row) => <span className="nowrap">{formatDate(row.dueDate)}</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: (row) => money.format(row.snapshot.totals.grandTotal) },
    {
      key: 'balance',
      header: 'Balance now',
      align: 'right',
      render: (row) =>
        row.status === 'void' ? <span className="muted">—</span> : row.booking?.totals?.balance > 0 ? <span className="text-danger strong">{money.format(row.booking.totals.balance)}</span> : <span className="text-success strong">Paid</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (row.status === 'void' ? <Badge tone="danger">Void</Badge> : row.booking && <PaymentStatusBadge status={row.booking.paymentStatus} />),
    },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Issued invoices and what is still due on them"
        actions={
          can('invoices.create') && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Generate invoice
            </Button>
          )
        }
      />
      <Card>
        <div style={{ padding: '4px 16px 0' }}>
          <Tabs tabs={TABS} value={tab.value} onChange={(value) => setParams({ tab: value })} />
        </div>
        <div className="toolbar">
          <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search invoice no., booking no. or customer" />
          <DateRangeFilter from={params.from} to={params.to} onChange={(range) => setParams(range)} />
        </div>
        <DataTable
          columns={columns}
          rows={invoices.data?.data}
          loading={invoices.isLoading}
          refreshing={invoices.isFetching && !invoices.isLoading}
          error={invoices.error}
          onRetry={() => invoices.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          onRowClick={(row) => navigate(`/invoices/${row._id}`)}
          rowClassName={(row) => (row.status === 'void' ? 'row--voided' : undefined)}
          empty={<EmptyState icon={FileText} title="No invoices here">Generate an invoice from a booking or with the button above.</EmptyState>}
        />
        <Pagination meta={invoices.data?.meta} onPageChange={(page) => setParams({ page })} />
      </Card>
      <GenerateInvoiceDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
