import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartColumn, Table2 } from 'lucide-react';
import { Segmented } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Feedback';
import { SERIES_COLORS } from './seriesColors';

// Chart conventions (see ARCHITECTURE / dataviz rules):
//   bars ≤ 24px with 4px rounded data-ends, 2px surface gap between adjacent bars, hairline solid grid,
//   one y-axis only, legend for ≥ 2 series, tooltip leads with values, every chart has a table view.


const AXIS_TICK = { fill: 'var(--ink-3)', fontSize: 12 };

export function ChartLegend({ series }) {
  if (series.length < 2) return null;
  return (
    <ul className="chart-legend" aria-label="Legend">
      {series.map((entry) => (
        <li key={entry.key}>
          <span className="chart-legend__swatch" style={{ background: entry.color }} aria-hidden />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipContent({ active, payload, label, series, formatValue, formatLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__title">{formatLabel ? formatLabel(label) : label}</div>
      {series.map((entry) => {
        const item = payload.find((point) => point.dataKey === entry.key);
        if (!item) return null;
        return (
          <div key={entry.key} className="chart-tooltip__row">
            <span className="chart-tooltip__key" style={{ background: entry.color }} aria-hidden />
            <span className="chart-tooltip__value">{formatValue(item.value)}</span>
            <span className="chart-tooltip__label">{entry.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Vertical columns, one or more series side by side.
 * @param {{ data: object[], xKey: string, series: { key: string, label: string, color: string }[],
 *           formatValue: (v: number) => string, formatTick?: (v: number) => string, formatLabel?: (v: string) => string,
 *           height?: number }} props
 */
export function ColumnChart({ data, xKey, series, formatValue, formatTick, formatLabel, height = 260 }) {
  const hasNegative = data.some((row) => series.some((entry) => row[entry.key] < 0));
  return (
    <div>
      <ChartLegend series={series} />
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey={xKey} tickFormatter={formatLabel} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--chart-axis)' }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={formatTick ?? formatValue} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} allowDecimals={false} />
            {hasNegative && <ReferenceLine y={0} stroke="var(--chart-axis)" />}
            <Tooltip
              cursor={{ fill: 'rgba(122, 31, 61, 0.05)' }}
              content={<TooltipContent series={series} formatValue={formatValue} formatLabel={formatLabel} />}
            />
            {series.map((entry) => (
              <Bar key={entry.key} dataKey={entry.key} name={entry.label} fill={entry.color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Horizontal bars with the value at the tip — for ranked categories (event types, expense categories).
 * Plain HTML so labels never collide and every value is readable without hovering.
 */
export function BarList({ rows, formatValue, color = SERIES_COLORS.single, emptyText = 'No data for this period' }) {
  if (!rows.length) return <EmptyState compact title={emptyText} icon={ChartColumn} />;
  const max = Math.max(...rows.map((row) => row.value), 0);
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.key} className="bar-list__row" title={`${row.label}: ${formatValue(row.value)}`}>
          <span className="bar-list__label truncate">{row.label}</span>
          <span className="bar-list__track">
            <span className="bar-list__bar" style={{ width: `${max > 0 ? Math.max(1.5, (row.value / max) * 100) : 0}%`, background: color }} />
          </span>
          <span className="bar-list__value tabular">{formatValue(row.value)}</span>
          {row.note && <span className="bar-list__note">{row.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chart with a Chart / Table switch so every figure is reachable without hovering.
 * `leading` renders extra controls (e.g. a metric switch) at the start of the same row.
 */
export function ChartWithTable({ chart, columns, rows, leading }) {
  const [view, setView] = useState('chart');
  return (
    <div className="stack stack--sm">
      <div className="row row--between">
        {/* min-width 0 lets a wide control (e.g. the metric switch) scroll inside the card instead of widening the page */}
        <div style={{ minWidth: 0, maxWidth: '100%' }}>{leading}</div>
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: 'Chart', icon: ChartColumn },
            { value: 'table', label: 'Table', icon: Table2 },
          ]}
        />
      </div>
      {view === 'chart' ? (
        chart
      ) : (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="table table--compact">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === 'right' ? 'num' : undefined}>
                      {column.render ? column.render(row) : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
