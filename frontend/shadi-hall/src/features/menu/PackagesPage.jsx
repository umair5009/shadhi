import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive, Package, Pencil, Plus, Users } from 'lucide-react';
import { menuApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useMoney } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { PACKAGE_PRICING_TYPES, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, QueryBoundary, Spinner } from '@/components/ui/Feedback';
import { Segmented, SearchInput } from '@/components/ui/Controls';
import { MoneyInput, Checkbox } from '@/components/form/Field';
import { MoneyField, NumberField, SelectField, SwitchField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { requiredText, optionalText, money } from '@/lib/validation';

const schema = z.object({
  name: requiredText('Package name', 80),
  description: optionalText(1000),
  pricingType: z.string(),
  price: money('Package price', { required: true }),
  minGuests: z.number().int().min(0).optional(),
  isActive: z.boolean(),
});

/** Every dish on the menu (all pages), for building packages. */
async function fetchAllDishes() {
  const dishes = [];
  for (let page = 1; ; page += 1) {
    const response = await menuApi.items({ page, limit: 100, sort: 'name' });
    dishes.push(...response.data);
    if (page >= response.meta.totalPages) return dishes;
  }
}

const INCLUSION = [
  { value: 'none', label: 'No' },
  { value: 'included', label: 'Included' },
  { value: 'optional', label: 'Optional' },
];

function DishSelector({ selection, onChange }) {
  const money = useMoney();
  const [q, setQ] = useState('');
  const dishes = useQuery({ queryKey: ['menu', 'items', 'all'], queryFn: fetchAllDishes, staleTime: 60 * 1000 });
  if (dishes.isLoading) return <Spinner />;
  const filtered = (dishes.data ?? []).filter((dish) => !q || dish.name.toLowerCase().includes(q.toLowerCase()) || dish.category?.name.toLowerCase().includes(q.toLowerCase()));
  const groups = filtered.reduce((map, dish) => {
    const key = dish.category?.name ?? 'Other';
    map.set(key, [...(map.get(key) ?? []), dish]);
    return map;
  }, new Map());
  const chosen = Object.values(selection).filter((entry) => entry.state !== 'none');

  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        <span className="field__label">
          Dishes · {chosen.filter((entry) => entry.state === 'included').length} included, {chosen.filter((entry) => entry.state === 'optional').length} optional
        </span>
        <div style={{ width: 260 }}>
          <SearchInput value={q} onChange={setQ} placeholder="Find a dish" delay={100} />
        </div>
      </div>
      <div className="dish-selector">
        {[...groups.entries()].map(([category, list]) => (
          <div key={category}>
            <div className="dish-selector__category">{category}</div>
            {list.map((dish) => {
              const entry = selection[dish._id] ?? { state: 'none', extraPrice: 0 };
              return (
                <div key={dish._id} className={`dish-selector__row${entry.state !== 'none' ? ' dish-selector__row--on' : ''}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="table-primary truncate">{dish.name}</div>
                    <div className="table-secondary">{money.format(dish.price)} on its own</div>
                  </div>
                  <Segmented label={`${dish.name} in package`} options={INCLUSION} value={entry.state} onChange={(state) => onChange({ ...selection, [dish._id]: { ...entry, state, extraPrice: state === 'optional' && !entry.extraPrice ? dish.price : entry.extraPrice } })} />
                  {entry.state === 'optional' ? (
                    <div style={{ width: 150 }}>
                      <MoneyInput aria-label={`Extra price for ${dish.name}`} value={entry.extraPrice} onChange={(value) => onChange({ ...selection, [dish._id]: { ...entry, extraPrice: value === '' ? 0 : value } })} style={{ height: 34 }} />
                    </div>
                  ) : (
                    <div style={{ width: 150 }} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function PackageFormDialog(props) {
  return props.open ? <PackageFormBody {...props} /> : null;
}

function PackageFormBody({ onClose, pkg }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(pkg);
  const [selection, setSelection] = useState(() =>
    Object.fromEntries((pkg?.items ?? []).filter((entry) => entry.menuItem).map((entry) => [entry.menuItem._id, { state: entry.isOptional ? 'optional' : 'included', extraPrice: entry.extraPrice }])),
  );
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: pkg?.name ?? '',
      description: pkg?.description ?? '',
      pricingType: pkg?.pricingType ?? 'per_person',
      price: pkg?.price ?? '',
      minGuests: pkg?.minGuests ?? 0,
      isActive: pkg?.isActive ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const items = Object.entries(selection)
      .filter(([, entry]) => entry.state !== 'none')
      .map(([menuItem, entry]) => ({ menuItem, isOptional: entry.state === 'optional', extraPrice: entry.state === 'optional' ? entry.extraPrice : 0 }));
    if (!items.some((item) => !item.isOptional)) {
      toast.error('Include at least one dish in the package');
      return;
    }
    try {
      const body = { ...values, minGuests: values.minGuests ?? 0, items };
      if (isEdit) await menuApi.updatePackage(pkg._id, body);
      else await menuApi.createPackage(body);
      await queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success(isEdit ? 'Package updated' : `${values.name} package created`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${pkg.name}` : 'New package'}
      description="Existing bookings keep the package exactly as it was when they were booked."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="package-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save package' : 'Create package'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="package-form" className="stack" onSubmit={onSubmit} noValidate>
          <div className="form-grid form-grid--3">
            <TextField name="name" label="Package name" required autoFocus placeholder="e.g. Gold" />
            <SelectField name="pricingType" label="Pricing" options={toOptions(PACKAGE_PRICING_TYPES)} />
            <MoneyField name="price" label="Price" required />
            <NumberField name="minGuests" label="Minimum guests" min="0" hint="0 = no minimum" />
            <TextareaField name="description" label="Description" rows={1} className="span-2" />
          </div>
          <SwitchField name="isActive" label="Offer this package for new bookings" />
          <DishSelector selection={selection} onChange={setSelection} />
        </form>
      </FormProvider>
    </Dialog>
  );
}

function PackageCard({ pkg, onEdit, onRemove }) {
  const money = useMoney();
  const { can } = useAuth();
  const included = pkg.items.filter((entry) => !entry.isOptional && entry.menuItem);
  const optional = pkg.items.filter((entry) => entry.isOptional && entry.menuItem);
  const byCategory = included.reduce((map, entry) => {
    const key = entry.menuItem.category?.name ?? 'Other';
    map.set(key, [...(map.get(key) ?? []), entry.menuItem.name]);
    return map;
  }, new Map());

  return (
    <Card className={`package-card${pkg.isActive ? '' : ' package-card--inactive'}`}>
      <div className="package-card__head">
        <div>
          <h2 className="package-card__name">
            {pkg.name} {!pkg.isActive && <Badge>Archived</Badge>}
          </h2>
          {pkg.description && <p className="secondary">{pkg.description}</p>}
        </div>
        <div className="package-card__price">
          {money.format(pkg.price)}
          <small>{pkg.pricingType === 'per_person' ? 'per person' : 'fixed price'}</small>
        </div>
      </div>
      <div className="package-card__body">
        {[...byCategory.entries()].map(([category, names]) => (
          <div key={category} className="package-card__group">
            <span className="package-card__category">{category}</span>
            <span>{names.join(' · ')}</span>
          </div>
        ))}
        {optional.length > 0 && (
          <div className="package-card__group">
            <span className="package-card__category">Optional</span>
            <span>{optional.map((entry) => `${entry.menuItem.name} (+${money.format(entry.extraPrice)})`).join(' · ')}</span>
          </div>
        )}
      </div>
      <div className="package-card__foot">
        <span className="muted row" style={{ gap: 6 }}>
          <Users size={14} aria-hidden /> {pkg.minGuests ? `From ${formatNumber(pkg.minGuests)} guests · ` : ''}
          {pkg.bookingCount} booking{pkg.bookingCount === 1 ? '' : 's'}
        </span>
        {can('menu.manage') && (
          <div className="row">
            <IconButton icon={Archive} label={pkg.bookingCount ? 'Archive' : 'Delete'} size="sm" variant="ghost" onClick={() => onRemove(pkg)} />
            <Button size="sm" icon={Pencil} onClick={() => onEdit(pkg)}>
              Edit
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function PackagesPage() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const [dialog, setDialog] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const packages = useQuery({ queryKey: ['menu', 'packages', { includeInactive: showArchived }], queryFn: () => menuApi.packages({ includeInactive: showArchived }) });
  const remove = useApiMutation((id) => menuApi.removePackage(id), {
    success: (result) => (result.archived ? 'Package archived — bookings that use it are unchanged' : 'Package deleted'),
    invalidate: [['menu']],
  });

  const askRemove = async (pkg) => {
    const ok = await confirm({
      title: pkg.bookingCount ? `Archive ${pkg.name}?` : `Delete ${pkg.name}?`,
      message: pkg.bookingCount ? 'It is used by bookings, so it will be hidden from new bookings but kept for history.' : 'This package has never been booked and will be removed.',
      confirmLabel: pkg.bookingCount ? 'Archive' : 'Delete',
      danger: !pkg.bookingCount,
    });
    if (ok) remove.mutate(pkg._id);
  };

  return (
    <>
      <PageHeader
        title="Menu packages"
        subtitle="Ready-made menus priced per person or as a fixed amount"
        breadcrumbs={[{ label: 'Menu', to: '/menu' }, { label: 'Packages' }]}
        actions={
          <>
            <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
            {can('menu.manage') && (
              <Button variant="primary" icon={Plus} onClick={() => setDialog({})}>
                New package
              </Button>
            )}
          </>
        }
      />
      <QueryBoundary query={packages}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon={Package} title="No packages yet" action={can('menu.manage') && <Button variant="primary" icon={Plus} onClick={() => setDialog({})}>Create a package</Button>}>
              Packages make booking faster: choose Gold or Platinum and the price per guest is filled in.
            </EmptyState>
          ) : (
            <div className="grid grid--cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
              {list.map((pkg) => (
                <PackageCard key={pkg._id} pkg={pkg} onEdit={(entry) => setDialog({ pkg: entry })} onRemove={askRemove} />
              ))}
            </div>
          )
        }
      </QueryBoundary>
      <PackageFormDialog open={Boolean(dialog)} onClose={() => setDialog(null)} pkg={dialog?.pkg} />
    </>
  );
}
