// Labels and colour tones for enums shared with the API.
export * from '@shared/constants.js';

export const BOOKING_STATUS_TONES = {
  inquiry: 'info',
  tentative: 'warning',
  confirmed: 'brand',
  completed: 'success',
  cancelled: 'neutral',
};

export const PAYMENT_STATUS_TONES = {
  unpaid: 'danger',
  partial: 'warning',
  paid: 'success',
  overpaid: 'info',
};

export const STOCK_STATUS = {
  in_stock: { label: 'In stock', tone: 'success' },
  low_stock: { label: 'Low stock', tone: 'warning' },
  out_of_stock: { label: 'Out of stock', tone: 'danger' },
};

export const ATTENDANCE_TONES = {
  present: 'success',
  late: 'warning',
  half_day: 'info',
  leave: 'gold',
  absent: 'danger',
};

export const STAFF_STATUS_TONES = {
  active: 'success',
  on_leave: 'warning',
  terminated: 'neutral',
};

export const HALL_STATUS_TONES = {
  active: 'success',
  maintenance: 'warning',
  inactive: 'neutral',
};

/** Options for <Select> from a shared enum list. */
export const toOptions = (list) => list.map((entry) => ({ value: entry.value, label: entry.label }));
