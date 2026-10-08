import { Controller, useFormContext } from 'react-hook-form';
import { Field, Input, Textarea, Select, MoneyInput, Switch } from './Field';

// Fields bound to the surrounding <FormProvider>. Errors come from Zod (client) or the API (applyServerErrors).

function errorAt(errors, name) {
  return name.split('.').reduce((node, key) => node?.[key], errors)?.message;
}

export function TextField({ name, label, hint, required, type = 'text', className, ...rest }) {
  const { register, formState } = useFormContext();
  const error = errorAt(formState.errors, name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, invalid, describedBy }) => <Input id={id} type={type} aria-invalid={invalid} aria-describedby={describedBy} {...register(name)} {...rest} />}
    </Field>
  );
}

export function NumberField({ name, label, hint, required, className, ...rest }) {
  const { register, formState } = useFormContext();
  const error = errorAt(formState.errors, name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, invalid, describedBy }) => (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          onWheel={(event) => event.currentTarget.blur()}
          {...register(name, { setValueAs: (value) => (value === '' || value === null ? undefined : Number(value)) })}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextareaField({ name, label, hint, required, className, rows = 3, ...rest }) {
  const { register, formState } = useFormContext();
  const error = errorAt(formState.errors, name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, invalid, describedBy }) => <Textarea id={id} rows={rows} aria-invalid={invalid} aria-describedby={describedBy} {...register(name)} {...rest} />}
    </Field>
  );
}

export function SelectField({ name, label, hint, required, options, placeholder, className, ...rest }) {
  const { register, formState } = useFormContext();
  const error = errorAt(formState.errors, name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, invalid, describedBy }) => (
        <Select id={id} options={options} placeholder={placeholder} aria-invalid={invalid} aria-describedby={describedBy} {...register(name)} {...rest} />
      )}
    </Field>
  );
}

export function MoneyField({ name, label, hint, required, className, ...rest }) {
  const { control, formState } = useFormContext();
  const error = errorAt(formState.errors, name);
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {({ id, invalid, describedBy }) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <MoneyInput id={id} aria-invalid={invalid} aria-describedby={describedBy} value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} {...rest} />
          )}
        />
      )}
    </Field>
  );
}

export function SwitchField({ name, label, hint, disabled }) {
  const { control } = useFormContext();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={label} hint={hint} disabled={disabled} />}
    />
  );
}

export function DateField(props) {
  return <TextField type="date" {...props} />;
}

export function TimeField(props) {
  return <TextField type="time" step={300} {...props} />;
}
