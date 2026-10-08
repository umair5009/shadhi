import { format as formatDateFns, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { formatMoney as formatMoneyShared, DEFAULT_CURRENCY } from '@shared/format.js';

export { DEFAULT_CURRENCY };

export function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  return formatMoneyShared(amount, currency);
}

/**
 * Short money for chart axes and tight spaces. PKR uses lakh/crore as people say it: 12.5 lakh, 3.2 crore.
 */
export function formatMoneyCompact(amount, currency = DEFAULT_CURRENCY) {
  const value = Number(amount) || 0;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const trim = (number) => number.toFixed(number >= 100 ? 0 : 1).replace(/\.0$/, '');
  if (currency.code === 'PKR') {
    if (abs >= 1e7) return `${sign}${trim(abs / 1e7)} Cr`;
    if (abs >= 1e5) return `${sign}${trim(abs / 1e5)} L`;
    if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
    return `${sign}${abs}`;
  }
  if (abs >= 1e9) return `${sign}${trim(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trim(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3)}K`;
  return `${sign}${abs}`;
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString('en-PK');
}

/**
 * Business dates (event day, payment day…) are stored as UTC midnight of the calendar day, so they are formatted
 * from their YYYY-MM-DD part — never shifted by the browser's timezone.
 */
export function formatDate(value, pattern = 'dd MMM yyyy') {
  if (!value) return '—';
  const text = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return formatDateFns(parseISO(text), pattern);
}

/** Real timestamps (createdAt, lastLoginAt) in the viewer's local time. */
export function formatDateTime(value, pattern = 'dd MMM yyyy, h:mm a') {
  if (!value) return '—';
  return formatDateFns(new Date(value), pattern);
}

export function formatRelative(value) {
  if (!value) return '';
  return `${formatDistanceToNowStrict(new Date(value))} ago`;
}

/** '19:30' → '7:30 PM' */
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatTimeRange(start, end) {
  if (!start) return '';
  const nextDay = end && end <= start ? ' (+1 day)' : '';
  return `${formatTime(start)} – ${formatTime(end)}${nextDay}`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function percent(value, digits = 0) {
  if (value === null || value === undefined) return '—';
  return `${Number(value).toFixed(digits)}%`;
}
