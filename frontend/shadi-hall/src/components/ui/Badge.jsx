import clsx from 'clsx';
import {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  BOOKING_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  STOCK_STATUS,
  labelOf,
} from '@/lib/labels';

/** @param {{ tone?: 'neutral'|'brand'|'gold'|'success'|'warning'|'danger'|'info', dot?: boolean }} props */
export function Badge({ tone = 'neutral', dot = false, className, children, ...rest }) {
  return (
    <span className={clsx('badge', tone !== 'neutral' && `badge--${tone}`, className)} {...rest}>
      {dot && <span className="badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

export function BookingStatusBadge({ status }) {
  return (
    <Badge tone={BOOKING_STATUS_TONES[status]} dot>
      {labelOf(BOOKING_STATUSES, status)}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }) {
  return <Badge tone={PAYMENT_STATUS_TONES[status]}>{labelOf(PAYMENT_STATUSES, status)}</Badge>;
}

export function StockBadge({ status }) {
  const entry = STOCK_STATUS[status] ?? STOCK_STATUS.in_stock;
  return (
    <Badge tone={entry.tone} dot>
      {entry.label}
    </Badge>
  );
}
