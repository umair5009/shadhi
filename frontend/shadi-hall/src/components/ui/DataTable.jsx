import clsx from 'clsx';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { EmptyState, ErrorState, Skeleton } from './Feedback';

/**
 * Table driven by column definitions.
 * @param {{
 *   columns: { key: string, header: string, render?: (row: any) => import('react').ReactNode, align?: 'left'|'right'|'center',
 *              sortKey?: string, width?: string|number, className?: string, mobile?: 'title'|'hide' }[],
 *   rows?: any[], rowKey?: (row: any) => string, onRowClick?: (row: any) => void, rowClassName?: (row: any) => string,
 *   sort?: string, onSortChange?: (sort: string) => void, loading?: boolean, error?: Error, onRetry?: () => void,
 *   empty?: import('react').ReactNode, footer?: import('react').ReactNode, compact?: boolean, refreshing?: boolean
 * }} props
 *
 * On phones each row becomes a card: the `mobile: 'title'` column (default: the first) heads the card and every
 * other cell shows as "Label ··· value". `mobile: 'hide'` drops a column on phones.
 */
export function DataTable({
  columns,
  rows = [],
  rowKey = (row) => row._id,
  onRowClick,
  rowClassName,
  sort,
  onSortChange,
  loading = false,
  error,
  onRetry,
  empty,
  footer,
  compact = false,
  refreshing = false,
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;

  const sortState = (column) => {
    if (!column.sortKey || !sort) return null;
    if (sort === column.sortKey) return 'asc';
    if (sort === `-${column.sortKey}`) return 'desc';
    return null;
  };

  const toggleSort = (column) => {
    const state = sortState(column);
    onSortChange?.(state === 'desc' ? column.sortKey : `-${column.sortKey}`);
  };

  const alignClass = (column) => (column.align === 'right' ? 'num' : column.align === 'center' ? 'center' : undefined);
  const titleKey = (columns.find((column) => column.mobile === 'title') ?? columns[0])?.key;
  const mobileClass = (column) => (column.key === titleKey ? 'cell--title' : column.mobile === 'hide' ? 'cell--hide-mobile' : !column.header ? 'cell--actions' : undefined);

  return (
    <div className={clsx('table-wrap', refreshing && 'is-refreshing')}>
      <table className={clsx('table table--cards', onRowClick && 'table--clickable', compact && 'table--compact')}>
        <thead>
          <tr>
            {columns.map((column) => {
              const state = sortState(column);
              const SortIcon = state === 'asc' ? ArrowUp : state === 'desc' ? ArrowDown : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  className={alignClass(column)}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={state === 'asc' ? 'ascending' : state === 'desc' ? 'descending' : undefined}
                >
                  {column.sortKey && onSortChange ? (
                    <button type="button" className={clsx('table__sort', state && 'table__sort--active')} onClick={() => toggleSort(column)}>
                      {column.header}
                      <SortIcon size={12} aria-hidden />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 6 }, (_, index) => (
              <tr key={`skeleton-${index}`}>
                {columns.map((column) => (
                  <td key={column.key} className={mobileClass(column)}>
                    <Skeleton width={column.align === 'right' ? '60%' : '80%'} style={column.align === 'right' ? { marginLeft: 'auto' } : undefined} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={rowClassName?.(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => event.key === 'Enter' && onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={clsx(alignClass(column), mobileClass(column), column.className)} data-label={column.header}>
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
        {footer && !loading && rows.length > 0 && <tfoot>{footer}</tfoot>}
      </table>
      {!loading && rows.length === 0 && (empty ?? <EmptyState compact title="Nothing here yet" />)}
    </div>
  );
}

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.total === 0) return null;
  const { page, limit, total, totalPages } = meta;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="tabular">
        Showing {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="pagination__controls">
        <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="tabular" style={{ padding: '0 8px' }}>
          Page {page} of {totalPages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight size={15} aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
