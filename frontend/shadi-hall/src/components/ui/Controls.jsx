import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useDebouncedValue } from '@/lib/hooks';
import { initials } from '@/lib/format';

/** Search box that reports its value after the user pauses typing. */
export function SearchInput({ value = '', onChange, placeholder = 'Search…', delay = 350, autoFocus }) {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, delay);
  const lastReported = useRef(value);

  useEffect(() => {
    if (debounced !== lastReported.current) {
      lastReported.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  useEffect(() => {
    if (value !== lastReported.current) {
      lastReported.current = value;
      setText(value);
    }
  }, [value]);

  return (
    <div className="search-input">
      <Search size={16} aria-hidden />
      <input
        className="input"
        type="search"
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        aria-label={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

/** Pill-style single choice (view switchers, filters). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <option.icon size={15} aria-hidden />}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Large tappable choices, e.g. payment method. */
export function ChipGroup({ options, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" className="chip" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.icon && <tab.icon size={15} aria-hidden />}
          {tab.label}
          {tab.count !== undefined && <span className="tab__count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Dropdown menu for row/page actions. Closes on outside click and Escape. */
export function Menu({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'mousedown' && ref.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}
      {open && (
        <div className={clsx('menu__panel', align === 'left' && 'menu__panel--left')} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: Icon, danger = false, children, ...rest }) {
  return (
    <button type="button" role="menuitem" className={clsx('menu__item', danger && 'menu__item--danger')} {...rest}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="menu__divider" role="separator" />;
}

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={clsx('avatar', size === 'lg' && 'avatar--lg')} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = 'success', label }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx('progress__bar', tone !== 'success' && `progress__bar--${tone}`)} style={{ width: `${width}%` }} />
    </div>
  );
}
