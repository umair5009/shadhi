import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRightLeft, Pencil, RefreshCw, Trash2, ShoppingCart, PackageMinus } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useListParams, useMoney } from '@/lib/hooks';
import { formatDate, formatNumber } from '@/lib/format';
import { INVENTORY_KINDS, INVENTORY_TRANSACTION_TYPES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge, StockBadge } from '@/components/ui/Badge';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { ProgressBar } from '@/components/ui/Controls';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { InventoryItemDialog, StockMovementDialog } from './inventoryDialogs';

export function InventoryItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const money = useMoney();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(null);
  const [params, setParams] = useListParams({ page: 1 });
  const itemQuery = useQuery({ queryKey: ['inventory', 'items', id], queryFn: () => inventoryApi.item(id) });
  const ledger = useQuery({
    queryKey: ['inventory', 'transactions', id, params.page],
    queryFn: () => inventoryApi.transactions({ item: id, page: params.page, limit: 25 }),
    placeholderData: keepPreviousData,
  });
  const remove = useApiMutation(() => inventoryApi.removeItem(id), { success: 'Item deleted', invalidate: [['inventory']], onSuccess: () => navigate('/inventory') });
  const updateActive = useApiMutation((isActive) => inventoryApi.updateItem(id, { isActive }), { success: 'Item updated', invalidate: [['inventory']] });

  if (itemQuery.isLoading) return <PageLoader />;
  if (itemQuery.isError) return <ErrorState error={itemQuery.error} onRetry={() => itemQuery.refetch()} />;
  const item = itemQuery.data;
  const canTransact = can('inventory.transact') && item.isActive;

  const reconcile = async () => {
    const result = await inventoryApi.reconcile(id);
    toast[result.fixed ? 'warning' : 'success'](result.fixed ? `Stock corrected from ${result.cached} to ${result.ledger} ${item.unit}` : 'Stock matches the movement history');
    itemQuery.refetch();
  };

  const askDelete = async () => {
    const hasHistory = (ledger.data?.meta.total ?? 0) > 0;
    const ok = await confirm({
      title: hasHistory ? `Deactivate ${item.name}?` : `Delete ${item.name}?`,
      message: hasHistory ? 'Items with stock history are kept. It will be hidden from the inventory list.' : 'This item has no history and will be removed.',
      confirmLabel: hasHistory ? 'Deactivate' : 'Delete',
      danger: true,
    });
    if (!ok) return;
    if (hasHistory) updateActive.mutate(false);
    else remove.mutate();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: item.name }]}
        title={
          <>
            {item.name}
            <StockBadge status={item.stockStatus} />
            {!item.isActive && <Badge>Inactive</Badge>}
          </>
        }
        subtitle={`${item.sku} · ${labelOf(INVENTORY_KINDS, item.kind)} · ${item.category}`}
        actions={
          <>
            {can('inventory.manage') &&
              (item.isActive ? (
                <Button variant="ghost" icon={Trash2} onClick={askDelete}>
                  Remove
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => updateActive.mutate(true)}>
                  Reactivate
                </Button>
              ))}
            {can('inventory.manage') && (
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canTransact && (
              <>
                <Button icon={PackageMinus} onClick={() => setMoving('stock_out')}>
                  Use stock
                </Button>
                <Button variant="primary" icon={ShoppingCart} onClick={() => setMoving('purchase')}>
                  Record purchase
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="split split--aside-first">
        <Card>
          <CardHeader title="Stock history" subtitle="Every movement in and out" actions={can('inventory.manage') && <Button size="sm" variant="ghost" icon={RefreshCw} onClick={reconcile}>Re-check total</Button>} />
          <DataTable
            columns={[
              { key: 'date', header: 'Date', render: (row) => <span className="nowrap">{formatDate(row.date)}</span> },
              {
                key: 'type',
                header: 'Movement',
                render: (row) => (
                  <>
                    <Badge tone={row.quantityChange > 0 ? 'success' : row.quantityChange < 0 ? 'danger' : 'neutral'}>{labelOf(INVENTORY_TRANSACTION_TYPES, row.type)}</Badge>
                    {row.booking && (
                      <div className="table-secondary">
                        for <Link to={`/bookings/${row.booking._id}`} onClick={(event) => event.stopPropagation()}>{row.booking.bookingNumber}</Link>
                      </div>
                    )}
                  </>
                ),
              },
              {
                key: 'change',
                header: 'Change',
                align: 'right',
                render: (row) => (
                  <span className={row.quantityChange > 0 ? 'text-success strong' : row.quantityChange < 0 ? 'text-danger strong' : 'strong'}>
                    {row.quantityChange > 0 ? '+' : ''}
                    {formatNumber(row.quantityChange)}
                  </span>
                ),
              },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => formatNumber(row.balanceAfter) },
              { key: 'cost', header: 'Value', align: 'right', render: (row) => (row.totalCost ? money.format(row.totalCost) : '—') },
              {
                key: 'details',
                header: 'Details',
                render: (row) => (
                  <div className="table-secondary">
                    {[row.supplier?.name, row.reference, row.notes].filter(Boolean).join(' · ') || '—'}
                    {row.expense && <div>Expense {row.expense.expenseNumber}</div>}
                    <div>by {row.createdBy?.name}</div>
                  </div>
                ),
              },
            ]}
            rows={ledger.data?.data}
            loading={ledger.isLoading}
            error={ledger.error}
            empty={<EmptyState compact icon={ArrowRightLeft} title="No movements yet" />}
          />
          <Pagination meta={ledger.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
        <aside className="stack">
          <Card>
            <CardBody>
              <div className="stack">
                <div>
                  <div className="stat__label">In stock</div>
                  <div className={`stat__value${item.stockStatus !== 'in_stock' ? ' stat__value--danger' : ''}`}>
                    {formatNumber(item.currentQuantity)} {item.unit}
                  </div>
                </div>
                <ProgressBar value={item.currentQuantity} max={Math.max(item.minimumQuantity * 2, item.currentQuantity, 1)} tone={item.stockStatus === 'in_stock' ? 'success' : 'warning'} label="Stock level" />
                <dl className="details">
                  <dt>Minimum</dt>
                  <dd>
                    {formatNumber(item.minimumQuantity)} {item.unit}
                  </dd>
                  <dt>Cost / unit</dt>
                  <dd>{money.format(item.costPerUnit)}</dd>
                  <dt>Stock value</dt>
                  <dd className="strong">{money.format(item.stockValue)}</dd>
                  <dt>Supplier</dt>
                  <dd>{item.supplier ? `${item.supplier.name}${item.supplier.phone ? ` · ${item.supplier.phone}` : ''}` : '—'}</dd>
                  <dt>Location</dt>
                  <dd>{item.location || '—'}</dd>
                </dl>
                {item.notes && <p className="secondary">{item.notes}</p>}
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
      <InventoryItemDialog open={editing} onClose={() => setEditing(false)} item={item} />
      <StockMovementDialog open={Boolean(moving)} onClose={() => setMoving(null)} item={item} initialType={moving ?? 'purchase'} />
    </>
  );
}
