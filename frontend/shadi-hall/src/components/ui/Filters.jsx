import { Select } from '@/components/form/Field';
import { RANGE_PRESETS, presetRange } from '@/lib/dates';
import { useToday } from '@/lib/hooks';

/**
 * Date range filter: preset list first (what people reach for), custom from/to after.
 * @param {{ from?: string, to?: string, onChange: (range: { from?: string, to?: string }) => void, presets?: string[], allowAll?: boolean }} props
 */
export function DateRangeFilter({ from, to, onChange, presets = RANGE_PRESETS.map((preset) => preset.value), allowAll = true }) {
  const today = useToday();
  const current = RANGE_PRESETS.find((preset) => {
    const range = presetRange(preset.value, today);
    return range.from === from && range.to === to;
  })?.value;
  const mode = current ?? (from || to ? 'custom' : 'all');
  // '' (explicitly cleared) and undefined both mean "any date".
  const options = [
    ...(allowAll ? [{ value: 'all', label: 'Any date' }] : []),
    ...RANGE_PRESETS.filter((preset) => presets.includes(preset.value)),
    { value: 'custom', label: 'Custom range…' },
  ];

  return (
    <div className="date-range">
      <Select
        aria-label="Date range"
        options={options}
        value={mode}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'all') onChange({ from: null, to: null });
          else if (value === 'custom') onChange({ from: from || today, to: to || today });
          else onChange(presetRange(value, today));
        }}
      />
      {mode === 'custom' && (
        <>
          <input className="input" type="date" aria-label="From" value={from ?? ''} onChange={(event) => onChange({ from: event.target.value || null, to })} />
          <span className="muted">to</span>
          <input className="input" type="date" aria-label="To" value={to ?? ''} min={from} onChange={(event) => onChange({ from, to: event.target.value || null })} />
        </>
      )}
    </div>
  );
}

/** Compact <select> for toolbars: '' means "all". */
export function FilterSelect({ label, value, options, onChange, allLabel }) {
  return <Select aria-label={label} value={value ?? ''} placeholder={allLabel ?? `All ${label.toLowerCase()}`} options={options} onChange={(event) => onChange(event.target.value || undefined)} />;
}
