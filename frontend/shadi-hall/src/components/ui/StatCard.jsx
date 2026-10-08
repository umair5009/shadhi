import clsx from 'clsx';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Skeleton } from './Feedback';

/**
 * Stat tile: label, value, optional change vs the previous period and a short note.
 * @param {{ label: string, value: import('react').ReactNode, icon?: import('react').ComponentType, tone?: 'brand'|'gold'|'success'|'danger'|'info',
 *           change?: number|null, upIsGood?: boolean, changeLabel?: string, meta?: import('react').ReactNode, to?: string,
 *           hero?: boolean, danger?: boolean, loading?: boolean }} props
 */
export function StatCard({ label, value, icon: Icon, tone = 'brand', change, upIsGood = true, changeLabel = 'vs last period', meta, to, hero = false, danger = false, loading = false }) {
  const Tag = to ? Link : 'div';
  const hasChange = change !== undefined && change !== null;
  const good = hasChange && (change === 0 ? null : change > 0 === upIsGood);
  const DeltaIcon = hasChange && change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <Tag to={to} className={clsx('card stat', hero && 'hero-stat', to && 'stat--link')} style={to ? { color: 'inherit' } : undefined}>
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {Icon && (
          <span className={clsx('stat__icon', tone !== 'brand' && `stat__icon--${tone}`)}>
            <Icon size={18} aria-hidden />
          </span>
        )}
      </div>
      {loading ? <Skeleton width="60%" height={30} /> : <span className={clsx('stat__value', danger && 'stat__value--danger')}>{value}</span>}
      {(hasChange || meta) && !loading && (
        <div className="stat__meta">
          {hasChange && (
            <span className={clsx('delta', good === null ? 'delta--flat' : good ? 'delta--good' : 'delta--bad')}>
              {change !== 0 && <DeltaIcon size={13} aria-hidden />}
              {change > 0 ? '+' : ''}
              {change}%
            </span>
          )}
          {hasChange && <span>{changeLabel}</span>}
          {meta && <span>{meta}</span>}
        </div>
      )}
    </Tag>
  );
}
