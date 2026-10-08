import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { expensesApi } from '@/api/endpoints';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Field } from '@/components/form/Field';
import { DateField, MoneyField, SelectField, TextField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { BookingPicker } from '@/features/bookings/BookingPicker';
import { useToday } from '@/lib/hooks';
import { useExpenseCategories } from './queries';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { money, dateText, requiredText, optionalText } from '@/lib/validation';
import { PAYMENT_METHODS, toOptions } from '@/lib/labels';

const schema = z.object({
  category: z.string().min(1, 'Choose a category'),
  amount: money('Amount', { required: true, positive: true }),
  date: dateText('Date'),
  description: requiredText('Description', 500),
  vendor: optionalText(120),
  paymentMethod: z.string().min(1),
  reference: optionalText(100),
  booking: z.any().nullable(),
});

/**
 * Add or edit an expense. Pass `booking` to link a new expense to an event.
 * @param {{ open: boolean, onClose: () => void, expense?: object, booking?: object }} props
 */
export function ExpenseFormDialog(props) {
  return props.open ? <ExpenseFormBody {...props} /> : null;
}

function ExpenseFormBody({ onClose, expense, booking }) {
  const queryClient = useQueryClient();
  const today = useToday();
  const categories = useExpenseCategories();
  const [receipt, setReceipt] = useState(null);
  const isEdit = Boolean(expense);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      category: expense?.category?._id ?? '',
      amount: expense?.amount ?? '',
      date: expense ? String(expense.date).slice(0, 10) : today,
      description: expense?.description ?? '',
      vendor: expense?.vendor ?? '',
      paymentMethod: expense?.paymentMethod ?? 'cash',
      reference: expense?.reference ?? '',
      booking: expense?.booking ?? booking ?? null,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const body = { ...values, booking: values.booking?._id ?? null };
    try {
      const response = isEdit ? await expensesApi.update(expense._id, body) : await expensesApi.create(body);
      if (receipt) await expensesApi.setReceipt(response.data._id, receipt);
      await Promise.all(MONEY_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(isEdit ? 'Expense updated' : `Expense ${response.data.expenseNumber} added`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  const activeCategories = (categories.data ?? []).filter((category) => category.isActive || category._id === expense?.category?._id);

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${expense.expenseNumber}` : 'Add expense'}
      description={isEdit ? 'Changes are recorded in the expense history.' : 'Link it to an event to see that event’s real profit.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add expense'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="expense-form" className="stack" onSubmit={onSubmit} noValidate>
          {isEdit && expense.source !== 'manual' && <Alert tone="info">This expense was created automatically. Change it from its salary or stock entry instead.</Alert>}
          <div className="form-grid">
            <SelectField name="category" label="Category" required placeholder="Choose a category" options={activeCategories.map((category) => ({ value: category._id, label: category.name }))} />
            <MoneyField name="amount" label="Amount" required />
            <TextField name="description" label="What was it for?" required className="span-all" placeholder="e.g. LESCO bill for September" />
            <DateField name="date" label="Date" required max={today} />
            <TextField name="vendor" label="Paid to (vendor)" />
            <SelectField name="paymentMethod" label="Paid by" options={toOptions(PAYMENT_METHODS)} />
            <TextField name="reference" label="Reference / bill no." />
          </div>
          <Controller
            control={form.control}
            name="booking"
            render={({ field }) => (
              <Field label="Related event (optional)" hint="Counts this cost against the event’s profit">
                {({ id }) => <BookingPicker id={id} value={field.value} onChange={field.onChange} placeholder="Search the event this cost belongs to" />}
              </Field>
            )}
          />
          <Field label="Receipt" hint={expense?.receipt ? 'Uploading a new file replaces the current receipt' : 'Photo or PDF, up to 5 MB'}>
            {({ id }) => (
              <label className="btn" htmlFor={id} style={{ justifyContent: 'flex-start', width: 'fit-content' }}>
                <Paperclip size={16} aria-hidden /> {receipt ? receipt.name : 'Attach receipt'}
                <input id={id} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} />
              </label>
            )}
          </Field>
        </form>
      </FormProvider>
    </Dialog>
  );
}
