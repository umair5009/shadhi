import { useId } from 'react';
import clsx from 'clsx';
import { useMoney } from '@/lib/hooks';

/** Label + control + hint + error. `children` receives the generated id for the control. */
export function Field({ label, hint, error, required = false, className, children }) {
  const id = useId();
  return (
    <div className={clsx('field', error && 'field--invalid', className)}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
          {required && (
            <span className="field__required" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {typeof children === 'function' ? children({ id, invalid: Boolean(error), describedBy: error ? `${id}-error` : hint ? `${id}-hint` : undefined }) : children}
      {error ? (
        <span id={`${id}-error`} className="field__error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className="field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

export function Input({ className, ...rest }) {
  return <input className={clsx('input', className)} {...rest} />;
}

export function Textarea({ className, ...rest }) {
  return <textarea className={clsx('textarea', className)} {...rest} />;
}

/** @param {{ options: { value: string, label: string }[], placeholder?: string }} props */
export function Select({ options, placeholder, className, ...rest }) {
  return (
    <select className={clsx('select', className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Number input with the currency symbol in front. Value is a number (or '' while empty). */
export function MoneyInput({ value, onChange, className, ...rest }) {
  const { currency } = useMoney();
  return (
    <div className="input-group">
      <span className="input-group__addon">{currency.symbol}</span>
      <input
        className={clsx('input input--with-addon input--money', className)}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
        onWheel={(event) => event.currentTarget.blur()}
        {...rest}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch__track" aria-hidden />
      {label && (
        <span>
          <span className="switch__label">{label}</span>
          {hint && <span className="switch__hint">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
