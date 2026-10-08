import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customersApi } from '@/api/endpoints';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { requiredText, phone, optionalPhone, optionalEmail, optionalText, cnic } from '@/lib/validation';

const schema = z.object({
  fullName: requiredText('Full name', 120),
  phone: phone('Phone number'),
  alternatePhone: optionalPhone('Alternate phone'),
  email: optionalEmail(),
  cnic: cnic(),
  city: optionalText(80),
  address: optionalText(300),
  notes: optionalText(2000),
});

const EMPTY = { fullName: '', phone: '', alternatePhone: '', email: '', cnic: '', city: '', address: '', notes: '' };
const FIELDS = Object.keys(EMPTY);

/**
 * Add or edit a customer.
 * @param {{ open: boolean, onClose: () => void, customer?: object, initialValues?: object,
 *           onSaved?: (customer: object) => void, onUseExisting?: (customer: object) => void }} props
 */
export function CustomerFormDialog(props) {
  return props.open ? <CustomerFormBody {...props} /> : null;
}

function CustomerFormBody({ onClose, customer, initialValues, onSaved, onUseExisting }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(customer);
  const [duplicate, setDuplicate] = useState(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY, ...Object.fromEntries(FIELDS.map((field) => [field, (customer ?? initialValues ?? {})[field] ?? ''])) },
  });

  const close = () => {
    setDuplicate(null);
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setDuplicate(null);
    try {
      const response = isEdit ? await customersApi.update(customer._id, values) : await customersApi.create(values);
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEdit ? 'Customer updated' : `${response.data.fullName} added`);
      onSaved?.(response.data);
      close();
    } catch (error) {
      const existingId = error.details?.find?.((detail) => detail.existingCustomerId)?.existingCustomerId;
      if (existingId) setDuplicate({ id: existingId, message: error.message });
      applyServerErrors(error, form.setError, FIELDS);
    }
  });

  const useExisting = async () => {
    const existing = await customersApi.get(duplicate.id);
    onUseExisting?.(existing);
    close();
  };

  return (
    <Dialog
      open
      onClose={close}
      title={isEdit ? 'Edit customer' : 'Add customer'}
      description={isEdit ? undefined : 'Name and phone are enough to get started.'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="customer-form" className="stack" onSubmit={onSubmit} noValidate>
          {duplicate && (
            <Alert
              tone="warning"
              title={duplicate.message}
              action={
                onUseExisting ? (
                  <Button size="sm" onClick={useExisting}>
                    Use this customer
                  </Button>
                ) : (
                  <Button size="sm" to={`/customers/${duplicate.id}`} onClick={close}>
                    Open customer
                  </Button>
                )
              }
            />
          )}
          <div className="form-grid">
            <TextField name="fullName" label="Full name" required autoFocus className="span-all" />
            <TextField name="phone" label="Phone" required type="tel" placeholder="0300-1234567" />
            <TextField name="alternatePhone" label="Alternate phone" type="tel" />
            <TextField name="email" label="Email" type="email" />
            <TextField name="cnic" label="CNIC" placeholder="35202-1234567-1" hint="Optional" />
            <TextField name="city" label="City" />
            <TextField name="address" label="Address" />
            <TextareaField name="notes" label="Notes" className="span-all" rows={2} />
          </div>
        </form>
      </FormProvider>
    </Dialog>
  );
}
