import { useQueryClient } from '@tanstack/react-query';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { inventoryApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { BookingPicker } from '@/features/bookings/BookingPicker';
import { useMoney, useToday } from '@/lib/hooks';
import { useSuppliers } from './queries';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { requiredText, optionalText, money, dateText } from '@/lib/validation';
import { INVENTORY_KINDS, INVENTORY_UNITS, INVENTORY_TRANSACTION_TYPES, PAYMENT_METHODS, toOptions } from '@/lib/labels';
import { lineTotal } from '@shared/bookingFinance.js';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Controls';
import { Field, Checkbox } from '@/components/form/Field';
import { DateField, MoneyField, NumberField, SelectField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';

const itemSchema = z.object({
  name: requiredText('Item name', 100),
  kind: z.string(),
  category: requiredText('Category', 60),
  sku: z.string().trim().regex(/^[A-Za-z0-9-]{2,40}$/, 'Letters, numbers and dashes only'),
  unit: z.string().min(1, 'Choose a unit'),
  minimumQuantity: z.number({ invalid_type_error: 'Enter a number' }).min(0),
  costPerUnit: money('Cost per unit'),
  supplier: z.string().optional(),
  location: optionalText(100),
  notes: optionalText(1000),
  openingQuantity: z.number().min(0).optional(),
});

export function InventoryItemDialog(props) {
  return props.open ? <InventoryItemBody {...props} /> : null;
}

function InventoryItemBody({ onClose, item, onSaved }) {
  const queryClient = useQueryClient();
  const suppliers = useSuppliers();
  const isEdit = Boolean(item);
  const form = useForm({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: item?.name ?? '',
      kind: item?.kind ?? 'food',
      category: item?.category ?? '',
      sku: item?.sku ?? '',
      unit: item?.unit ?? 'kg',
      minimumQuantity: item?.minimumQuantity ?? 0,
      costPerUnit: item?.costPerUnit ?? '',
      supplier: item?.supplier?._id ?? '',
      location: item?.location ?? '',
      notes: item?.notes ?? '',
      openingQuantity: 0,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const { openingQuantity, ...rest } = values;
    const body = { ...rest, costPerUnit: values.costPerUnit === '' ? 0 : values.costPerUnit, supplier: values.supplier || null };
    try {
      const response = isEdit ? await inventoryApi.updateItem(item._id, body) : await inventoryApi.createItem({ ...body, openingQuantity: openingQuantity ?? 0 });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(isEdit ? 'Item updated' : `${response.data.name} added`);
      onSaved?.(response.data);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(itemSchema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${item.name}` : 'Add inventory item'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="item-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="item-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <TextField name="name" label="Item name" required autoFocus className="span-all" />
          <SelectField name="kind" label="Type" options={toOptions(INVENTORY_KINDS)} />
          <TextField name="category" label="Category" required placeholder="e.g. Rice, Spices, Furniture" />
          <TextField name="sku" label="SKU / code" required placeholder="RICE-001" />
          <SelectField name="unit" label="Unit" options={toOptions(INVENTORY_UNITS)} />
          <NumberField name="minimumQuantity" label="Alert when below" hint="Low-stock level" min="0" step="any" />
          <MoneyField name="costPerUnit" label="Cost per unit" />
          <SelectField name="supplier" label="Usual supplier" placeholder="None" options={(suppliers.data ?? []).map((supplier) => ({ value: supplier._id, label: supplier.name }))} />
          <TextField name="location" label="Storage location" placeholder="Main store room" />
          {!isEdit && <NumberField name="openingQuantity" label="Stock on hand now" hint="Recorded as opening stock" min="0" step="any" />}
          <TextareaField name="notes" label="Notes" rows={2} className="span-all" />
        </form>
      </FormProvider>
    </Dialog>
  );
}

const movementSchema = z.object({
  type: z.string(),
  quantity: z.number({ invalid_type_error: 'Enter a quantity' }).min(0, 'Quantity cannot be negative'),
  unitCost: money('Unit cost'),
  supplier: z.string().optional(),
  booking: z.any().nullable(),
  date: dateText('Date'),
  reference: optionalText(100),
  notes: optionalText(500),
  recordExpense: z.boolean(),
  paymentMethod: z.string(),
});

const MOVEMENT_HELP = {
  purchase: 'Stock bought from a supplier. Adds to stock and can be recorded as an expense.',
  stock_in: 'Stock returned or received without a purchase (e.g. leftovers, gifts).',
  stock_out: 'Stock used — for an event or in the kitchen.',
  damaged: 'Broken, spoiled or lost stock.',
  adjustment: 'Enter what you actually counted; the difference is recorded.',
};

/** Records a stock movement for one item. */
export function StockMovementDialog(props) {
  return props.open && props.item ? <StockMovementBody {...props} /> : null;
}

function StockMovementBody({ onClose, item, initialType = 'purchase' }) {
  const queryClient = useQueryClient();
  const money = useMoney();
  const today = useToday();
  const { can } = useAuth();
  const suppliers = useSuppliers();
  const form = useForm({
    resolver: zodResolver(movementSchema),
    defaultValues: {
      type: initialType,
      quantity: undefined,
      unitCost: item.costPerUnit ?? '',
      supplier: item.supplier?._id ?? '',
      booking: null,
      date: today,
      reference: '',
      notes: '',
      recordExpense: true,
      paymentMethod: 'cash',
    },
  });
  const values = useWatch({ control: form.control });

  const type = values.type ?? initialType;
  const direction = INVENTORY_TRANSACTION_TYPES.find((entry) => entry.value === type)?.direction;
  const quantity = Number(values.quantity) || 0;
  const after = direction === 0 ? quantity : item.currentQuantity + direction * quantity;

  const onSubmit = form.handleSubmit(async (formValues) => {
    if (formValues.type !== 'adjustment' && !(formValues.quantity > 0)) {
      form.setError('quantity', { message: 'Quantity must be more than zero' });
      return;
    }
    const body = {
      item: item._id,
      type: formValues.type,
      quantity: formValues.quantity,
      date: formValues.date,
      reference: formValues.reference,
      notes: formValues.notes,
      ...(formValues.type === 'purchase' || formValues.type === 'stock_in' ? { unitCost: formValues.unitCost === '' ? undefined : formValues.unitCost } : {}),
      ...(formValues.type === 'purchase' ? { supplier: formValues.supplier || null, recordExpense: formValues.recordExpense, paymentMethod: formValues.paymentMethod } : {}),
      ...(formValues.booking ? { booking: formValues.booking._id } : {}),
    };
    try {
      const result = await inventoryApi.recordTransaction(body);
      await Promise.all([['inventory'], ...MONEY_QUERY_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(`${item.name}: now ${result.balanceAfter} ${item.unit}${result.expense ? ` · expense ${result.expense.expenseNumber} recorded` : ''}`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(movementSchema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Stock movement · ${item.name}`}
      description={`In stock now: ${item.currentQuantity} ${item.unit}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="movement-form" variant="primary" loading={form.formState.isSubmitting}>
            Save movement
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="movement-form" className="stack" onSubmit={onSubmit} noValidate>
          <Controller control={form.control} name="type" render={({ field }) => <Segmented label="Movement type" options={toOptions(INVENTORY_TRANSACTION_TYPES)} value={field.value} onChange={field.onChange} />} />
          <p className="field__hint">{MOVEMENT_HELP[type]}</p>
          <div className="form-grid">
            <NumberField name="quantity" label={type === 'adjustment' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`} required min="0" step="any" autoFocus />
            <DateField name="date" label="Date" required max={today} />
            {(type === 'purchase' || type === 'stock_in') && <MoneyField name="unitCost" label={`Cost per ${item.unit}`} />}
            {type === 'purchase' && <SelectField name="supplier" label="Supplier" placeholder="None" options={(suppliers.data ?? []).map((supplier) => ({ value: supplier._id, label: supplier.name }))} />}
            <TextField name="reference" label="Reference / bill no." />
          </div>
          {(type === 'stock_out' || type === 'purchase') && (
            <Controller
              control={form.control}
              name="booking"
              render={({ field }) => (
                <Field label="For event (optional)" hint={type === 'purchase' ? 'Links the purchase cost to that event’s profit' : 'Shows which event used the stock'}>
                  {({ id }) => <BookingPicker id={id} value={field.value} onChange={field.onChange} filters={{ status: 'tentative,confirmed,completed' }} />}
                </Field>
              )}
            />
          )}
          {type === 'purchase' && can('expenses.create') && (
            <div className="advance-box">
              <Controller control={form.control} name="recordExpense" render={({ field }) => <Checkbox label="Also record this purchase as an expense" checked={field.value} onChange={field.onChange} />} />
              {values.recordExpense && (
                <div className="row row--between">
                  <SelectField name="paymentMethod" label="Paid by" options={toOptions(PAYMENT_METHODS)} />
                  <span className="strong">Expense: {money.format(lineTotal(quantity, values.unitCost === '' ? item.costPerUnit : values.unitCost))}</span>
                </div>
              )}
            </div>
          )}
          <TextareaField name="notes" label="Notes" rows={2} />
          {quantity > 0 || type === 'adjustment' ? (
            <Alert tone={after < 0 ? 'danger' : after <= item.minimumQuantity ? 'warning' : 'info'}>
              {after < 0 ? `Only ${item.currentQuantity} ${item.unit} in stock.` : `Stock after this: ${Math.round(after * 1000) / 1000} ${item.unit}${after <= item.minimumQuantity ? ' — below the minimum' : ''}`}
            </Alert>
          ) : null}
        </form>
      </FormProvider>
    </Dialog>
  );
}
