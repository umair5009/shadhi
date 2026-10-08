import { useEffect, useRef } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Trash2, UtensilsCrossed } from 'lucide-react';
import { menuApi } from '@/api/endpoints';
import { usePackages } from '@/features/menu/queries';
import { useMoney } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { MENU_UNITS, labelOf } from '@/lib/labels';
import { lineTotal } from '@shared/bookingFinance.js';
import { AsyncCombobox } from '@/components/form/AsyncCombobox';
import { Field, MoneyInput, Checkbox } from '@/components/form/Field';
import { MoneyField, TextareaField } from '@/components/form/FormFields';
import { Segmented } from '@/components/ui/Controls';
import { IconButton } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';

const MODES = [
  { value: 'package', label: 'Package' },
  { value: 'custom', label: 'Custom menu' },
  { value: 'none', label: 'No food' },
];

const perPerson = (unit) => unit === 'per_person' || unit === 'per_plate';

/**
 * Editable dish lines (quantity × price) for custom menus and package extras.
 * `lines` is the useFieldArray result owned by MenuSection, so every component edits the same array.
 */
function DishLines({ name, lines: array, emptyText }) {
  const money = useMoney();
  const { control } = useFormContext();
  const { fields, remove } = array;
  const lines = useWatch({ control, name }) ?? [];

  if (fields.length === 0) return <p className="field__hint">{emptyText}</p>;
  return (
    <div className="table-wrap">
      <table className="table table--compact table--cards">
        <thead>
          <tr>
            <th>Dish</th>
            <th className="num" style={{ width: 110 }}>
              Qty
            </th>
            <th className="num" style={{ width: 150 }}>
              Price each
            </th>
            <th className="num">Total</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <tr key={field.id}>
              <td className="cell--title">
                <div className="table-primary">{field.name}</div>
                <div className="table-secondary">{labelOf(MENU_UNITS, field.unit)}</div>
              </td>
              <td className="num" data-label="Quantity">
                <Controller
                  control={control}
                  name={`${name}.${index}.quantity`}
                  render={({ field: input }) => (
                    <input
                      className="input tabular"
                      type="number"
                      min="0"
                      aria-label={`${field.name} quantity`}
                      value={input.value}
                      onChange={(event) => input.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                      style={{ textAlign: 'right', height: 34 }}
                    />
                  )}
                />
              </td>
              <td className="num" data-label="Price each">
                <Controller
                  control={control}
                  name={`${name}.${index}.unitPrice`}
                  render={({ field: input }) => <MoneyInput aria-label={`${field.name} price`} value={input.value} onChange={(value) => input.onChange(value === '' ? 0 : value)} style={{ height: 34 }} />}
                />
              </td>
              <td className="num strong" data-label="Total">
                {money.format(lineTotal(lines[index]?.quantity, lines[index]?.unitPrice))}
              </td>
              <td className="cell--actions">
                <IconButton icon={Trash2} label={`Remove ${field.name}`} size="sm" variant="ghost" onClick={() => remove(index)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Search box that appends a dish line. */
function AddDish({ lines, guestCount, priceFor, placeholder = 'Add a dish…' }) {
  const { fields, append } = lines;
  return (
    <AsyncCombobox
      queryKey="menu-items"
      fetchOptions={(q) => menuApi.items({ q, limit: 12, isAvailable: true }).then((response) => response.data)}
      placeholder={placeholder}
      emptyText="No dishes match"
      onSelect={(item) => {
        if (fields.some((line) => line.menuItem === item._id)) return;
        append({ menuItem: item._id, name: item.name, unit: item.unit, quantity: perPerson(item.unit) ? guestCount || 0 : 1, unitPrice: priceFor ? priceFor(item) : item.price });
      }}
      renderOption={(item) => (
        <div className="row row--between" style={{ flexWrap: 'nowrap' }}>
          <span>
            <span className="table-primary">{item.name}</span> <span className="table-secondary">· {item.category?.name}</span>
          </span>
          <PriceTag item={item} />
        </div>
      )}
    />
  );
}

function PriceTag({ item }) {
  const money = useMoney();
  return (
    <span className="table-secondary nowrap">
      {money.format(item.price)} {labelOf(MENU_UNITS, item.unit).toLowerCase()}
    </span>
  );
}

function PackageCards({ packages, selectedId, onSelect }) {
  const money = useMoney();
  return (
    <div className="package-options" role="radiogroup" aria-label="Menu package">
      {packages.map((pkg) => {
        const included = pkg.items.filter((entry) => !entry.isOptional && entry.menuItem);
        return (
          <button key={pkg._id} type="button" role="radio" aria-checked={selectedId === pkg._id} className={`package-option${selectedId === pkg._id ? ' package-option--selected' : ''}`} onClick={() => onSelect(pkg)}>
            <span className="package-option__name">{pkg.name}</span>
            <span className="package-option__price">
              {money.format(pkg.price)}
              <small>{pkg.pricingType === 'per_person' ? ' / person' : ' fixed'}</small>
            </span>
            <span className="package-option__dishes">{included.length} dishes</span>
          </button>
        );
      })}
    </div>
  );
}

function PackageDetails({ pkg, guestCount, extras }) {
  const money = useMoney();
  const { fields, append, remove } = extras;
  const included = pkg.items.filter((entry) => !entry.isOptional && entry.menuItem);
  const optional = pkg.items.filter((entry) => entry.isOptional && entry.menuItem);
  const optionalPrice = new Map(optional.map((entry) => [entry.menuItem._id, entry.extraPrice]));

  return (
    <div className="stack">
      <div>
        <div className="field__label" style={{ marginBottom: 6 }}>
          Included in {pkg.name}
        </div>
        <div className="tag-list">
          {included.map((entry) => (
            <Badge key={entry.menuItem._id} tone="gold">
              {entry.menuItem.name}
            </Badge>
          ))}
        </div>
      </div>
      <div className="form-grid">
        <MoneyField name="packageRate" label={pkg.pricingType === 'per_person' ? 'Agreed price per person' : 'Agreed package price'} hint={`Standard price ${money.format(pkg.price)} — change if you negotiated a different rate`} />
      </div>
      {optional.length > 0 && (
        <Field label="Optional dishes" hint="Charged on top of the package">
          {() => (
            <div className="stack stack--sm">
              {optional.map((entry) => {
                const index = fields.findIndex((line) => line.menuItem === entry.menuItem._id);
                return (
                  <Checkbox
                    key={entry.menuItem._id}
                    checked={index >= 0}
                    label={`${entry.menuItem.name} · +${money.format(entry.extraPrice)} ${pkg.pricingType === 'per_person' ? 'per person' : ''}`}
                    onChange={(checked) => {
                      if (checked) append({ menuItem: entry.menuItem._id, name: entry.menuItem.name, unit: entry.menuItem.unit, quantity: perPerson(entry.menuItem.unit) ? guestCount || 0 : 1, unitPrice: entry.extraPrice });
                      else remove(index);
                    }}
                  />
                );
              })}
            </div>
          )}
        </Field>
      )}
      <Field label="Extra dishes">
        {() => (
          <div className="stack stack--sm">
            <DishLines name="extras" lines={extras} emptyText="No extra dishes added." />
            <AddDish lines={extras} guestCount={guestCount} priceFor={(item) => optionalPrice.get(item._id) ?? item.price} placeholder="Add another dish to this package…" />
          </div>
        )}
      </Field>
    </div>
  );
}

export function MenuSection({ guestCount }) {
  const { control, setValue, getValues, formState } = useFormContext();
  const packages = usePackages();
  const extras = useFieldArray({ control, name: 'extras' });
  const customItems = useFieldArray({ control, name: 'customItems' });
  const mode = useWatch({ control, name: 'menuMode' });
  const packageId = useWatch({ control, name: 'packageId' });
  const selected = packages.data?.find((pkg) => pkg._id === packageId);

  // Per-person dishes follow the guest count, unless someone typed a different quantity for that dish.
  const previousGuests = useRef(guestCount);
  useEffect(() => {
    const previous = previousGuests.current;
    previousGuests.current = guestCount;
    if (!guestCount || previous === guestCount) return;
    for (const name of ['extras', 'customItems']) {
      getValues(name).forEach((line, index) => {
        if (perPerson(line.unit) && line.quantity === previous) setValue(`${name}.${index}.quantity`, guestCount, { shouldDirty: true });
      });
    }
  }, [guestCount, getValues, setValue]);

  const selectPackage = (pkg) => {
    setValue('packageId', pkg._id, { shouldValidate: true, shouldDirty: true });
    setValue('packageRate', pkg.price, { shouldDirty: true });
    extras.replace([]);
  };

  return (
    <div className="stack">
      <Controller control={control} name="menuMode" render={({ field }) => <Segmented label="Menu type" options={MODES} value={field.value} onChange={field.onChange} />} />

      {mode === 'package' && (
        <>
          {packages.isLoading ? (
            <Skeleton height={90} />
          ) : packages.data?.length ? (
            <PackageCards packages={packages.data} selectedId={packageId} onSelect={selectPackage} />
          ) : (
            <EmptyState compact icon={UtensilsCrossed} title="No packages yet">
              Create packages under Food & Inventory → Packages, or use a custom menu.
            </EmptyState>
          )}
          {formState.errors.packageId && <span className="field__error">{formState.errors.packageId.message}</span>}
          {selected && <PackageDetails pkg={selected} guestCount={guestCount} extras={extras} />}
          {!selected && packageId && <p className="field__hint">This booking uses a package that is no longer offered; its agreed price and dishes are kept.</p>}
        </>
      )}

      {mode === 'custom' && (
        <div className="stack stack--sm">
          <DishLines name="customItems" lines={customItems} emptyText="Search below to add dishes. Per-person dishes are set to the guest count." />
          <AddDish lines={customItems} guestCount={guestCount} />
          {formState.errors.customItems && <span className="field__error">{formState.errors.customItems.message}</span>}
        </div>
      )}

      {mode === 'none' && <p className="secondary">No food from the hall kitchen — hall booking only, or the customer brings their own caterer.</p>}

      {mode !== 'none' && guestCount > 0 && <p className="field__hint">Per-person dishes follow the guest count ({formatNumber(guestCount)}) unless you change a quantity yourself.</p>}
      <TextareaField name="menuNotes" label="Menu notes" rows={2} placeholder="e.g. less spicy, separate kids’ menu, serve at 9 pm" />
    </div>
  );
}
