import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { customersApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams, useMoney } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { EVENT_TYPES, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Avatar } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Feedback';
import { Checkbox } from '@/components/form/Field';
import { DateRangeFilter, FilterSelect } from '@/components/ui/Filters';
import { CustomerFormDialog } from './CustomerFormDialog';

const DEFAULTS = { page: 1 };

export function CustomersPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useListParams(DEFAULTS);
  const showMoney = can('payments.view');

  const query = {
    page: params.page,
    limit: 20,
    sort: params.sort,
    q: params.q,
    eventType: params.eventType,
    from: params.from,
    to: params.to,
    hasBalance: params.hasBalance,
  };
  const customers = useQuery({ queryKey: ['customers', 'list', query], queryFn: () => customersApi.list(query), placeholderData: keepPreviousData });

  const columns = [
    {
      key: 'fullName',
      header: 'Customer',
      sortKey: 'fullName',
      render: (row) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Avatar name={row.fullName} />
          <div style={{ minWidth: 0 }}>
            <div className="table-primary">{row.fullName}</div>
            <div className="table-secondary">{row.city || '—'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row) => (
        <>
          <div className="nowrap">{row.phone}</div>
          {row.alternatePhone && <div className="table-secondary nowrap">{row.alternatePhone}</div>}
        </>
      ),
    },
    {
      key: 'bookings',
      header: 'Bookings',
      align: 'right',
      render: (row) => (
        <>
          {row.stats.bookings}
          {row.stats.upcoming > 0 && (
            <div>
              <Badge tone="brand">{row.stats.upcoming} upcoming</Badge>
            </div>
          )}
        </>
      ),
    },
    { key: 'lastEvent', header: 'Last event', render: (row) => (row.stats.lastEventDate ? formatDate(row.stats.lastEventDate) : <span className="muted">—</span>) },
    ...(showMoney
      ? [
          { key: 'spent', header: 'Total spent', align: 'right', render: (row) => money.format(row.stats.totalBilled) },
          {
            key: 'outstanding',
            header: 'Owes',
            align: 'right',
            render: (row) => (row.stats.outstanding > 0 ? <span className="text-danger strong">{money.format(row.stats.outstanding)}</span> : <span className="muted">—</span>),
          },
        ]
      : []),
    { key: 'createdAt', header: 'Added', sortKey: 'createdAt', render: (row) => <span className="table-secondary">{formatDate(row.createdAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Families and companies who book with you"
        actions={
          can('customers.create') && (
            <Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>
              Add customer
            </Button>
          )
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search by name, phone, email or CNIC" />
          <FilterSelect label="Event types" allLabel="Any event type" value={params.eventType} options={toOptions(EVENT_TYPES)} onChange={(eventType) => setParams({ eventType })} />
          <DateRangeFilter from={params.from} to={params.to} onChange={(range) => setParams(range)} />
          {showMoney && <Checkbox label="Only customers who owe money" checked={params.hasBalance === 'true'} onChange={(checked) => setParams({ hasBalance: checked ? 'true' : undefined })} />}
        </div>
        {(params.from || params.to || params.eventType) && <p className="field__hint" style={{ padding: '8px 16px 0' }}>Showing customers with an event matching the date / type filters.</p>}
        <DataTable
          columns={columns}
          rows={customers.data?.data}
          loading={customers.isLoading}
          refreshing={customers.isFetching && !customers.isLoading}
          error={customers.error}
          onRetry={() => customers.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          onRowClick={(row) => navigate(`/customers/${row._id}`)}
          empty={
            <EmptyState icon={Users} title="No customers found" action={can('customers.create') && <Button icon={UserPlus} onClick={() => setAdding(true)}>Add customer</Button>}>
              Customers are also added automatically while creating a booking.
            </EmptyState>
          }
        />
        <Pagination meta={customers.data?.meta} onPageChange={(page) => setParams({ page })} />
      </Card>
      <CustomerFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(customer) => navigate(`/customers/${customer._id}`)} />
    </>
  );
}
