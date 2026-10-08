import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRightLeft, Boxes, Plus, TriangleAlert, Ban, Truck, Wallet } from 'lucide-react';
import { inventoryApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams, useMoney } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { INVENTORY_KINDS, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Tabs } from '@/components/ui/Controls';
import { StockBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterSelect } from '@/components/ui/Filters';
import { InventoryItemDialog, StockMovementDialog } from './inventoryDialogs';
import { useSuppliers } from './queries';

const STOCK_TABS = [
  { value: '', label: 'All items' },
  { value: 'low_stock,out_of_stock', label: 'Needs restocking' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

export function InventoryPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const { can } = useAuth();
  const suppliers = useSuppliers();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(null);
  const [params, setParams] = useListParams({ page: 1 });
  const categories = useQuery({ queryKey: ['inventory', 'categories'], queryFn: inventoryApi.categories });

  const query = { page: params.page, limit: 50, sort: params.sort, q: params.q, kind: params.kind, category: params.category, supplier: params.supplier, stockStatus: params.stockStatus };
  const items = useQuery({ queryKey: ['inventory', 'items', query], queryFn: () => inventoryApi.items(query), placeholderData: keepPreviousData });
  const summary = items.data?.summary;

  const columns = [
    {
      key: 'name',
      header: 'Item',
      sortKey: 'name',
      render: (row) => (
        <>
          <div className="table-primary">{row.name}</div>
          <div className="table-secondary">
            {row.sku} · {row.category}
          </div>
        </>
      ),
    },
    {
      key: 'stock',
      header: 'In stock',
      align: 'right',
      sortKey: 'currentQuantity',
      render: (row) => (
        <>
          <div className={row.stockStatus === 'in_stock' ? 'strong' : 'strong text-danger'}>
            {formatNumber(row.currentQuantity)} {row.unit}
          </div>
          <div className="table-secondary">min {formatNumber(row.minimumQuantity)}</div>
        </>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StockBadge status={row.stockStatus} /> },
    { key: 'cost', header: 'Cost / unit', align: 'right', render: (row) => money.format(row.costPerUnit) },
    { key: 'value', header: 'Stock value', align: 'right', render: (row) => money.format(row.stockValue) },
    { key: 'supplier', header: 'Supplier', render: (row) => <span className="table-secondary">{row.supplier?.name ?? '—'}</span> },
    { key: 'location', header: 'Location', render: (row) => <span className="table-secondary">{row.location || '—'}</span> },
    ...(can('inventory.transact')
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <div onClick={(event) => event.stopPropagation()}>
                <Button size="sm" icon={ArrowRightLeft} onClick={() => setMoving({ item: row, type: row.stockStatus === 'in_stock' ? 'stock_out' : 'purchase' })}>
                  Stock
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Kitchen stock and equipment — know what to buy before the next event"
        actions={
          <>
            <Button icon={Truck} to="/inventory/suppliers">
              Suppliers
            </Button>
            {can('inventory.manage') && (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add item
              </Button>
            )}
          </>
        }
      />
      <div className="stack">
        <div className="grid grid--4">
          <StatCard label="Stock value" icon={Wallet} value={money.format(summary?.stockValue ?? 0)} loading={items.isLoading} />
          <StatCard label="Items" icon={Boxes} tone="info" value={formatNumber(summary?.items ?? 0)} loading={items.isLoading} />
          <StatCard label="Low stock" icon={TriangleAlert} tone="gold" value={formatNumber(summary?.lowStock ?? 0)} loading={items.isLoading} />
          <StatCard label="Out of stock" icon={Ban} tone="danger" value={formatNumber(summary?.outOfStock ?? 0)} danger={summary?.outOfStock > 0} loading={items.isLoading} />
        </div>
        <Card>
          <div style={{ padding: '4px 16px 0' }}>
            <Tabs tabs={STOCK_TABS} value={params.stockStatus ?? ''} onChange={(stockStatus) => setParams({ stockStatus })} />
          </div>
          <div className="toolbar">
            <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search name, SKU, category or location" />
            <FilterSelect label="Type" allLabel="Food & equipment" value={params.kind} options={toOptions(INVENTORY_KINDS)} onChange={(kind) => setParams({ kind })} />
            <FilterSelect
              label="Categories"
              allLabel="All categories"
              value={params.category}
              options={[...new Set((categories.data ?? []).map((row) => row.category))].map((category) => ({ value: category, label: category }))}
              onChange={(category) => setParams({ category })}
            />
            <FilterSelect label="Suppliers" allLabel="Any supplier" value={params.supplier} options={(suppliers.data ?? []).map((supplier) => ({ value: supplier._id, label: supplier.name }))} onChange={(supplier) => setParams({ supplier })} />
          </div>
          <DataTable
            columns={columns}
            rows={items.data?.data}
            loading={items.isLoading}
            refreshing={items.isFetching && !items.isLoading}
            error={items.error}
            onRetry={() => items.refetch()}
            sort={params.sort}
            onSortChange={(sort) => setParams({ sort })}
            onRowClick={(row) => navigate(`/inventory/${row._id}`)}
            empty={<EmptyState icon={Boxes} title="No items here">{params.stockStatus ? 'Nothing needs restocking right now.' : 'Add rice, oil, chairs, crockery… to track stock.'}</EmptyState>}
          />
          <Pagination meta={items.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
      </div>
      <InventoryItemDialog open={adding} onClose={() => setAdding(false)} onSaved={(item) => navigate(`/inventory/${item._id}`)} />
      <StockMovementDialog open={Boolean(moving)} onClose={() => setMoving(null)} item={moving?.item} initialType={moving?.type} />
    </>
  );
}
