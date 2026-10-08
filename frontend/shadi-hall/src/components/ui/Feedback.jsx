import clsx from 'clsx';
import { CircleAlert, Info, TriangleAlert, CircleCheck, LoaderCircle, Inbox } from 'lucide-react';
import { Button } from './Button';

export function Spinner({ size = 20, label = 'Loading' }) {
  return <LoaderCircle size={size} className="spinner" role="status" aria-label={label} />;
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner size={28} />
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, style }) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}

export function EmptyState({ icon: Icon = Inbox, title, children, action, compact = false }) {
  return (
    <div className={clsx('empty-state', compact && 'empty-state--compact')}>
      <div className="empty-state__icon">
        <Icon size={24} aria-hidden />
      </div>
      {title && <p className="empty-state__title">{title}</p>}
      {children && <p className="empty-state__text">{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const forbidden = error?.status === 403;
  return (
    <div className={clsx('empty-state empty-state--error', compact && 'empty-state--compact')} role="alert">
      <div className="empty-state__icon">
        <CircleAlert size={24} aria-hidden />
      </div>
      <p className="empty-state__title">{forbidden ? 'You don’t have access to this' : 'Couldn’t load this'}</p>
      <p className="empty-state__text">{forbidden ? 'Ask your administrator if you need access.' : (error?.message ?? 'Something went wrong.')}</p>
      {onRetry && !forbidden && (
        <Button size="sm" onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </Button>
      )}
    </div>
  );
}

const ALERT_ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck };

export function Alert({ tone = 'info', title, children, action }) {
  const Icon = ALERT_ICONS[tone];
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && <p className="alert__title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** Renders loading / error / content for a React Query result. */
export function QueryBoundary({ query, loading, children }) {
  if (query.isLoading) return loading ?? <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return children(query.data);
}
