import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChefHat, Pencil, Plus, Trash2, UtensilsCrossed, Package } from 'lucide-react';
import { menuApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useListParams, useMoney, useToday } from '@/lib/hooks';
import { presetRange } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { MENU_UNITS, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Feedback';
import { Input, Switch } from '@/components/form/Field';
import { FilterSelect } from '@/components/ui/Filters';
import { BarList } from '@/components/charts/Charts';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { DishFormDialog } from './DishFormDialog';

const menuKeys = [['menu']];

function CategoryManager({ open, onClose, categories }) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const create = useApiMutation((value) => menuApi.createCategory({ name: value, sortOrder: (categories.length + 1) * 10 }), { success: 'Category added', invalidate: menuKeys, onSuccess: () => setName('') });
  const rename = useApiMutation(({ id, value }) => menuApi.updateCategory(id, { name: value }), { success: 'Category renamed', invalidate: menuKeys, onSuccess: () => setRenaming(null) });
  const remove = useApiMutation((id) => menuApi.removeCategory(id), { success: 'Category deleted', invalidate: menuKeys });

  return (
    <Dialog open={open} onClose={onClose} title="Menu categories" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <form
        className="row"
        style={{ flexWrap: 'nowrap', marginBottom: 12 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) create.mutate(name.trim());
        }}
      >
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Seafood" aria-label="New category" />
        <Button type="submit" icon={Plus} loading={create.isPending}>
          Add
        </Button>
      </form>
      <ul className="list-plain">
        {categories.map((category) => (
          <li key={category._id} className="list-row" style={{ padding: '8px 0' }}>
            {renaming?.id === category._id ? (
              <form
                className="row"
                style={{ flex: 1, flexWrap: 'nowrap' }}
                onSubmit={(event) => {
                  event.preventDefault();
                  rename.mutate({ id: category._id, value: renaming.value });
                }}
              >
                <Input value={renaming.value} autoFocus onChange={(event) => setRenaming({ ...renaming, value: event.target.value })} aria-label="Category name" />
                <Button type="submit" size="sm" variant="primary">
                  Save
                </Button>
              </form>
            ) : (
              <>
                <div className="list-row__main">
                  <span className="strong">{category.name}</span> <span className="muted">· {category.itemCount} dishes</span>
                </div>
                <IconButton icon={Pencil} label="Rename" size="sm" variant="ghost" onClick={() => setRenaming({ id: category._id, value: category.name })} />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  size="sm"
                  variant="ghost"
                  disabled={category.itemCount > 0}
                  title={category.itemCount > 0 ? 'Move or delete its dishes first' : 'Delete'}
                  onClick={async () => {
                    if (await confirm({ title: `Delete ${category.name}?`, confirmLabel: 'Delete', danger: true })) remove.mutate(category._id);
                  }}
                />
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function PopularDishes() {
  const today = useToday();
  const usage = useQuery({ queryKey: ['menu', 'usage'], queryFn: () => menuApi.usage(presetRange('last_12_months', today)) });
  const rows = (usage.data?.dishes ?? []).slice(0, 8).map((dish) => ({ key: String(dish._id), label: dish.name, value: dish.events, note: `${formatNumber(dish.guestsServed)} guests served` }));
  return (
    <Card>
      <CardHeader title="Most served" subtitle="Events in the last 12 months" />
      <CardBody>
        <BarList rows={rows} formatValue={(value) => `${value} events`} emptyText="No events with menus yet" />
      </CardBody>
    </Card>
  );
}

export function MenuPage() {
  const money = useMoney();
  const confirm = useConfirm();
  const { can } = useAuth();
  const canManage = can('menu.manage');
  const [params, setParams] = useListParams({ page: 1 });
  const [dishDialog, setDishDialog] = useState(null);
  const [managing, setManaging] = useState(false);
  const categories = useQuery({ queryKey: ['menu', 'categories'], queryFn: menuApi.categories });

  const query = { page: params.page, limit: 50, q: params.q, category: params.category, isAvailable: params.isAvailable, sort: params.sort };
  const items = useQuery({ queryKey: ['menu', 'items', query], queryFn: () => menuApi.items(query), placeholderData: keepPreviousData });
  const toggle = useApiMutation(({ id, isAvailable }) => menuApi.updateItem(id, { isAvailable }), { invalidate: menuKeys });
  const remove = useApiMutation((id) => menuApi.removeItem(id), { success: 'Dish deleted', invalidate: menuKeys });

  const columns = [
    {
      key: 'name',
      header: 'Dish',
      sortKey: 'name',
      render: (row) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="dish-thumb">{row.image ? <img src={row.image.url} alt="" loading="lazy" /> : <ChefHat size={18} aria-hidden />}</div>
          <div style={{ minWidth: 0 }}>
            <div className="table-primary">{row.name}</div>
            <div className="table-secondary truncate" style={{ maxWidth: 360 }}>
              {row.description || row.ingredients?.join(', ')}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (row) => row.category?.name },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      sortKey: 'price',
      render: (row) => (
        <>
          <div className="strong">{money.format(row.price)}</div>
          <div className="table-secondary">{labelOf(MENU_UNITS, row.unit).toLowerCase()}</div>
        </>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      render: (row) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Switch checked={row.isAvailable} disabled={!canManage} onChange={(isAvailable) => toggle.mutate({ id: row._id, isAvailable })} />
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <div className="row row--end" style={{ flexWrap: 'nowrap' }} onClick={(event) => event.stopPropagation()}>
                <IconButton icon={Pencil} label="Edit" size="sm" variant="ghost" onClick={() => setDishDialog({ dish: row })} />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({ title: `Delete ${row.name}?`, message: 'Past bookings keep their copy of this dish. Dishes used in packages can’t be deleted — mark them unavailable instead.', confirmLabel: 'Delete dish', danger: true });
                    if (ok) remove.mutate(row._id);
                  }}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  const categoryList = categories.data ?? [];

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Dishes you serve, used in packages and custom menus"
        actions={
          <>
            <Button icon={Package} to="/menu/packages">
              Packages
            </Button>
            {canManage && (
              <>
                <Button onClick={() => setManaging(true)}>Categories</Button>
                <Button variant="primary" icon={Plus} onClick={() => setDishDialog({})}>
                  Add dish
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="split">
        <Card>
          <div className="toolbar">
            <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search dishes or ingredients" />
            <FilterSelect label="Categories" allLabel="All categories" value={params.category} options={categoryList.map((category) => ({ value: category._id, label: `${category.name} (${category.itemCount})` }))} onChange={(category) => setParams({ category })} />
            <FilterSelect
              label="Availability"
              allLabel="Available or not"
              value={params.isAvailable}
              options={[
                { value: 'true', label: 'Available' },
                { value: 'false', label: 'Unavailable' },
              ]}
              onChange={(isAvailable) => setParams({ isAvailable })}
            />
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
            onRowClick={canManage ? (row) => setDishDialog({ dish: row }) : undefined}
            empty={
              <EmptyState icon={UtensilsCrossed} title="No dishes found" action={canManage && <Button icon={Plus} onClick={() => setDishDialog({})}>Add dish</Button>}>
                {categoryList.length === 0 ? 'Start by adding categories like Rice, BBQ and Desserts.' : 'Try another search or category.'}
              </EmptyState>
            }
          />
          <Pagination meta={items.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
        <aside className="stack">
          <PopularDishes />
        </aside>
      </div>
      <DishFormDialog open={Boolean(dishDialog)} onClose={() => setDishDialog(null)} dish={dishDialog?.dish} categories={categoryList} defaultCategory={params.category} />
      <CategoryManager open={managing} onClose={() => setManaging(false)} categories={categoryList} />
    </>
  );
}
