import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus } from 'lucide-react';
import { menuApi } from '@/api/endpoints';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/form/Field';
import { MoneyField, SelectField, SwitchField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { requiredText, optionalText, money } from '@/lib/validation';
import { MENU_UNITS, toOptions } from '@/lib/labels';

const schema = z.object({
  name: requiredText('Dish name', 100),
  category: z.string().min(1, 'Choose a category'),
  price: money('Price', { required: true }),
  unit: z.string(),
  description: optionalText(500),
  ingredients: optionalText(1000),
  notes: optionalText(500),
  isAvailable: z.boolean(),
});

export function DishFormDialog(props) {
  return props.open ? <DishFormBody {...props} /> : null;
}

function DishFormBody({ onClose, dish, categories, defaultCategory }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(dish);
  const [image, setImage] = useState(null);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: dish?.name ?? '',
      category: dish?.category?._id ?? defaultCategory ?? '',
      price: dish?.price ?? '',
      unit: dish?.unit ?? 'per_person',
      description: dish?.description ?? '',
      ingredients: dish?.ingredients?.join(', ') ?? '',
      notes: dish?.notes ?? '',
      isAvailable: dish?.isAvailable ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      ...values,
      ingredients: values.ingredients
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
    try {
      const response = isEdit ? await menuApi.updateItem(dish._id, body) : await menuApi.createItem(body);
      if (image) await menuApi.setItemImage(response.data._id, image);
      await queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success(isEdit ? 'Dish updated' : `${response.data.name} added to the menu`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${dish.name}` : 'Add dish'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="dish-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add dish'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="dish-form" className="stack" onSubmit={onSubmit} noValidate>
          <div className="form-grid">
            <TextField name="name" label="Dish name" required autoFocus className="span-all" />
            <SelectField name="category" label="Category" required placeholder="Choose a category" options={categories.map((category) => ({ value: category._id, label: category.name }))} />
            <SelectField name="unit" label="Priced" options={toOptions(MENU_UNITS)} />
            <MoneyField name="price" label="Price" required />
            <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <SwitchField name="isAvailable" label="Available for bookings" />
            </div>
            <TextareaField name="description" label="Description" className="span-all" rows={2} />
            <TextField name="ingredients" label="Main ingredients" hint="Separate with commas — e.g. chicken, tomatoes, ginger" className="span-all" />
            <TextField name="notes" label="Kitchen notes" className="span-all" />
          </div>
          <Field label="Photo" hint="Optional · PNG, JPG or WEBP">
            {({ id }) => (
              <label className="btn" htmlFor={id} style={{ width: 'fit-content' }}>
                <ImagePlus size={16} aria-hidden /> {image ? image.name : dish?.image ? 'Replace photo' : 'Add photo'}
                <input id={id} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
              </label>
            )}
          </Field>
        </form>
      </FormProvider>
    </Dialog>
  );
}
