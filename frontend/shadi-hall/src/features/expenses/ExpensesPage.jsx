import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Paperclip, Pencil, Plus, Receipt, Tags } from 'lucide-react';
import { expensesApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useListParams, useMoney, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { presetRange } from '@/lib/dates';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { EXPENSE_SOURCES, PAYMENT_METHODS, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState, PageLoader, Alert } from '@/components/ui/Feedback';
import { Checkbox, Input, Switch } from '@/components/form/Field';
import { DateRangeFilter, FilterSelect } from '@/components/ui/Filters';
import { BarList } from '@/components/charts/Charts';
import { SERIES_COLORS } from '@/components/charts/seriesColors';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { ExpenseFormDialog } from './ExpenseFormDialog';
import { useExpenseCategories } from './queries';

function ExpenseDetailDialog({ expenseId, onClose, onEdit }) {
  const money = useMoney();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [uploading, setUploading] = useState(false);
  const expense = useQuery({ queryKey: ['expenses', expenseId], queryFn: () => expensesApi.get(expenseId), enabled: Boolean(expenseId) });
  const voidExpense = useApiMutation(({ reason }) => expensesApi.void(expenseId, { reason }), { success: 'Expense voided', invalidate: MONEY_QUERY_KEYS });
  const data = expense.data;

  const askVoid = async () => {
    const reason = await confirm({
      title: `Void ${data.expenseNumber}?`,
      message: `${money.format(data.amount)} will no longer count in expenses and profit. The entry stays on record.`,
      confirmLabel: 'Void expense',
      danger: true,
      requireReason: true,
    });
    if (reason) voidExpense.mutate({ reason });
  };

  const attach = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await expensesApi.setReceipt(expenseId, file);
      await queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Receipt attached');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const editable = data && !data.void && data.source === 'manual' && can('expenses.update');
  return (
    <Dialog
      open={Boolean(expenseId)}
      onClose={onClose}
      title={data ? data.description : 'Expense'}
      description={data ? `${data.expenseNumber} · ${data.category?.name}` : undefined}
      size="lg"
      footer={
        data && (
          <>
            {!data.void && data.source !== 'salary' && can('expenses.void') && (
              <Button variant="ghost" icon={Ban} onClick={askVoid}>
                Void
              </Button>
            )}
            {editable && (
              <Button icon={Pencil} onClick={() => onEdit(data)}>
                Edit
              </Button>
            )}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        )
      }
    >
      {!data ? (
        <PageLoader />
      ) : (
        <div className="stack">
          {data.void && (
            <Alert tone="danger" title={`Voided ${formatDate(data.void.at)} by ${data.void.by?.name ?? 'someone'}`}>
              {data.void.reason}
            </Alert>
          )}
          {data.source !== 'manual' && <Alert tone="info">Created automatically from a {labelOf(EXPENSE_SOURCES, data.source).toLowerCase()}.</Alert>}
          <div className="grid grid--2">
            <dl className="details">
              <dt>Amount</dt>
              <dd className="strong" style={{ fontSize: 18 }}>
                {money.format(data.amount)}
              </dd>
              <dt>Date</dt>
              <dd>{formatDate(data.date)}</dd>
              <dt>Paid by</dt>
              <dd>
                {labelOf(PAYMENT_METHODS, data.paymentMethod)}
                {data.reference && <span className="muted"> · {data.reference}</span>}
              </dd>
              <dt>Paid to</dt>
              <dd>{data.vendor || data.supplier?.name || '—'}</dd>
            </dl>
            <dl className="details">
              <dt>Event</dt>
              <dd>{data.booking ? <Link to={`/bookings/${data.booking._id}?tab=profit`}>{data.booking.bookingNumber} · {data.booking.customer?.fullName}</Link> : '—'}</dd>
              {data.staff && (
                <>
                  <dt>Employee</dt>
                  <dd>
                    <Link to={`/staff/${data.staff._id}`}>{data.staff.name}</Link>
                  </dd>
                </>
              )}
              <dt>Receipt</dt>
              <dd>
                {data.receipt ? (
                  <a href={data.receipt.url} target="_blank" rel="noreferrer">
                    <Paperclip size={14} aria-hidden /> {data.receipt.name ?? 'View receipt'}
                  </a>
                ) : (
                  '—'
                )}
                {!data.void && can('expenses.create') && (
                  <label className="link-button" style={{ display: 'block', marginTop: 4, cursor: 'pointer' }}>
                    {uploading ? 'Uploading…' : data.receipt ? 'Replace receipt' : 'Attach receipt'}
                    <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => attach(event.target.files?.[0])} />
                  </label>
                )}
              </dd>
              <dt>Entered by</dt>
              <dd>
                {data.createdBy?.name} · {formatDateTime(data.createdAt)}
              </dd>
            </dl>
          </div>
          <div>
            <div className="field__label" style={{ marginBottom: 8 }}>
              History
            </div>
            <ol className="timeline">
              {data.history.map((entry) => (
                <li key={entry._id} className="timeline__item">
                  <span className="timeline__dot" aria-hidden />
                  <div className="timeline__body">
                    <div>{entry.summary}</div>
                    {entry.action === 'expense.updated' && entry.changes?.after && (
                      <ul className="table-secondary" style={{ margin: '2px 0', paddingLeft: 16 }}>
                        {Object.keys(entry.changes.after).map((field) => (
                          <li key={field}>
                            {field}: {String(entry.changes.before[field] ?? '—').slice(0, 40)} → {String(entry.changes.after[field] ?? '—').slice(0, 40)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="timeline__meta">
                      {entry.actorName} · {formatRelative(entry.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CategoriesDialog({ open, onClose }) {
  const categories = useExpenseCategories();
  const [name, setName] = useState('');
  const invalidate = [['expenses', 'categories']];
  const create = useApiMutation((value) => expensesApi.createCategory({ name: value }), { success: 'Category added', invalidate, onSuccess: () => setName('') });
  const update = useApiMutation(({ id, body }) => expensesApi.updateCategory(id, body), { success: 'Category updated', invalidate });

  return (
    <Dialog open={open} onClose={onClose} title="Expense categories" description="Switch off categories you don’t use; they stay on old expenses." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <form
        className="row"
        style={{ flexWrap: 'nowrap', marginBottom: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category name" aria-label="New category name" />
        <Button type="submit" icon={Plus} loading={create.isPending}>
          Add
        </Button>
      </form>
      <ul className="list-plain">
        {(categories.data ?? []).map((category) => (
          <li key={category._id} className="list-row" style={{ padding: '10px 0' }}>
            <div className="list-row__main">
              <span className="strong">{category.name}</span> {category.isSystem && <Badge tone="neutral">Built-in</Badge>}
            </div>
            <Switch checked={category.isActive} onChange={(isActive) => update.mutate({ id: category._id, body: { isActive } })} label={category.isActive ? 'In use' : 'Off'} />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function ExpensesPage() {
  const money = useMoney();
  const today = useToday();
  const { can } = useAuth();
  const categories = useExpenseCategories();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [managing, setManaging] = useState(false);
  const [params, setParams] = useListParams({ page: 1, ...presetRange('this_month', today) });

  const query = {
    page: params.page,
    limit: 25,
    sort: params.sort,
    q: params.q,
    category: params.category,
    source: params.source,
    paymentMethod: params.paymentMethod,
    from: params.from,
    to: params.to,
    eventLinked: params.eventLinked,
    includeVoided: params.includeVoided,
  };
  const expenses = useQuery({ queryKey: ['expenses', 'list', query], queryFn: () => expensesApi.list(query), placeholderData: keepPreviousData });
  const summary = expenses.data?.summary;

  const columns = [
    { key: 'date', header: 'Date', sortKey: 'date', render: (row) => <span className="nowrap">{formatDate(row.date)}</span> },
    {
      key: 'description',
      header: 'Expense',
      mobile: 'title',
      render: (row) => (
        <>
          <div className="table-primary">
            {row.description} {row.receipt && <Paperclip size={13} className="muted" aria-label="Has receipt" />}
          </div>
          <div className="table-secondary">
            {row.expenseNumber}
            {row.vendor ? ` · ${row.vendor}` : ''}
          </div>
        </>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => (
        <>
          <Badge tone="neutral">{row.category?.name}</Badge>
          {row.source !== 'manual' && <div className="table-secondary">{labelOf(EXPENSE_SOURCES, row.source)}</div>}
        </>
      ),
    },
    { key: 'event', header: 'Event', render: (row) => (row.booking ? <span className="table-secondary">{row.booking.bookingNumber}</span> : <span className="muted">—</span>) },
    { key: 'method', header: 'Paid by', render: (row) => labelOf(PAYMENT_METHODS, row.paymentMethod) },
    { key: 'amount', header: 'Amount', align: 'right', sortKey: 'amount', render: (row) => <span className="strong">{money.format(row.amount)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Money going out — bills, purchases, event costs and salaries"
        actions={
          <>
            {can('expenses.update') && (
              <Button icon={Tags} onClick={() => setManaging(true)}>
                Categories
              </Button>
            )}
            {can('expenses.create') && (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add expense
              </Button>
            )}
          </>
        }
      />
      <div className="stack">
        <div className="grid--summary">
          <StatCard label="Total spent" icon={Receipt} tone="danger" value={money.format(summary?.total ?? 0)} loading={expenses.isLoading} meta={`${summary?.count ?? 0} expenses in this view`} />
          <Card>
            <CardHeader title="By category" plain />
            <CardBody>
              <BarList rows={(summary?.byCategory ?? []).slice(0, 6).map((row) => ({ key: row.categoryId, label: row.name, value: row.total }))} formatValue={money.format} color={SERIES_COLORS.expenses} />
            </CardBody>
          </Card>
        </div>
        <Card>
          <div className="toolbar">
            <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search description, vendor or number" />
            <FilterSelect label="Categories" allLabel="All categories" value={params.category} options={(categories.data ?? []).map((category) => ({ value: category._id, label: category.name }))} onChange={(category) => setParams({ category })} />
            <FilterSelect label="Source" allLabel="Any source" value={params.source} options={toOptions(EXPENSE_SOURCES)} onChange={(source) => setParams({ source })} />
            <FilterSelect
              label="Event"
              allLabel="Event-linked or not"
              value={params.eventLinked}
              options={[
                { value: 'true', label: 'Linked to an event' },
                { value: 'false', label: 'General overheads' },
              ]}
              onChange={(eventLinked) => setParams({ eventLinked })}
            />
            <DateRangeFilter from={params.from} to={params.to} onChange={(range) => setParams(range)} />
            <Checkbox label="Show voided" checked={params.includeVoided === 'true'} onChange={(checked) => setParams({ includeVoided: checked ? 'true' : undefined })} />
          </div>
          <DataTable
            columns={columns}
            rows={expenses.data?.data}
            loading={expenses.isLoading}
            refreshing={expenses.isFetching && !expenses.isLoading}
            error={expenses.error}
            onRetry={() => expenses.refetch()}
            sort={params.sort}
            onSortChange={(sort) => setParams({ sort })}
            onRowClick={(row) => setViewing(row._id)}
            rowClassName={(row) => (row.void ? 'row--voided' : undefined)}
            empty={
              <EmptyState icon={Receipt} title="No expenses in this view" action={can('expenses.create') && <Button icon={Plus} onClick={() => setAdding(true)}>Add expense</Button>}>
                Change the filters or record a new expense.
              </EmptyState>
            }
          />
          <Pagination meta={expenses.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
      </div>
      <ExpenseFormDialog open={adding} onClose={() => setAdding(false)} />
      <ExpenseFormDialog open={Boolean(editing)} expense={editing} onClose={() => setEditing(null)} />
      <ExpenseDetailDialog
        expenseId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(expense) => {
          setViewing(null);
          setEditing(expense);
        }}
      />
      <CategoriesDialog open={managing} onClose={() => setManaging(false)} />
    </>
  );
}
