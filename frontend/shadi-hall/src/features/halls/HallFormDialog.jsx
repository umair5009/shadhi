import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hallsApi } from '@/api/endpoints';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Checkbox } from '@/components/form/Field';
import { MoneyField, NumberField, SelectField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { requiredText, optionalText, money } from '@/lib/validation';
import { HALL_FACILITIES, HALL_STATUSES, toOptions } from '@/lib/labels';

const COLORS = ['#7A1F3D', '#2F7D5B', '#B8862B', '#3A74C4', '#8E44AD', '#C0392B', '#16808C', '#5D4037'];

const schema = z.object({
  name: requiredText('Hall name', 80),
  description: optionalText(2000),
  capacity: z.number({ invalid_type_error: 'Enter the capacity' }).int().min(1, 'At least 1 guest'),
  basePrice: money('Base price', { required: true }),
  hourlyPrice: money('Hourly price'),
  facilities: z.array(z.string()),
  status: z.string(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export function HallFormDialog(props) {
  return props.open ? <HallFormBody {...props} /> : null;
}

function HallFormBody({ onClose, hall, onSaved }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(hall);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: hall?.name ?? '',
      description: hall?.description ?? '',
      capacity: hall?.capacity ?? undefined,
      basePrice: hall?.basePrice ?? '',
      hourlyPrice: hall?.hourlyPrice ?? '',
      facilities: hall?.facilities ?? [],
      status: hall?.status ?? 'active',
      color: hall?.color ?? COLORS[0],
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const body = { ...values, hourlyPrice: values.hourlyPrice === '' ? 0 : values.hourlyPrice };
    try {
      const response = isEdit ? await hallsApi.update(hall._id, body) : await hallsApi.create(body);
      await queryClient.invalidateQueries({ queryKey: ['halls'] });
      toast.success(isEdit ? 'Hall updated' : `${response.data.name} added`);
      onSaved?.(response.data);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${hall.name}` : 'Add hall'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="hall-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add hall'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="hall-form" className="stack" onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <TextField name="name" label="Hall name" required autoFocus />
            <NumberField name="capacity" label="Capacity (guests)" required min="1" />
            <MoneyField name="basePrice" label="Base price per event" required />
            <MoneyField name="hourlyPrice" label="Hourly price (optional)" />
            <SelectField name="status" label="Status" options={toOptions(HALL_STATUSES)} hint="Inactive halls can’t be booked" />
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <Field label="Calendar colour">
                  {() => (
                    <div className="row" role="radiogroup" aria-label="Calendar colour">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={field.value?.toLowerCase() === color.toLowerCase()}
                          aria-label={color}
                          className="color-swatch"
                          style={{ background: color }}
                          onClick={() => field.onChange(color)}
                        />
                      ))}
                    </div>
                  )}
                </Field>
              )}
            />
            <TextareaField name="description" label="Description" className="span-all" rows={2} />
          </div>
          <Controller
            control={form.control}
            name="facilities"
            render={({ field }) => (
              <Field label="Facilities">
                {() => (
                  <div className="facility-grid">
                    {HALL_FACILITIES.map((facility) => (
                      <Checkbox
                        key={facility.value}
                        label={facility.label}
                        checked={field.value?.includes(facility.value)}
                        onChange={(checked) => field.onChange(checked ? [...field.value, facility.value] : field.value.filter((value) => value !== facility.value))}
                      />
                    ))}
                  </div>
                )}
              </Field>
            )}
          />
        </form>
      </FormProvider>
    </Dialog>
  );
}
