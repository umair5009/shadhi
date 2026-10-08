import { X } from 'lucide-react';
import { bookingsApi } from '@/api/endpoints';
import { AsyncCombobox } from '@/components/form/AsyncCombobox';
import { BookingStatusBadge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';
import { useMoney } from '@/lib/hooks';
import { EVENT_TYPES, labelOf } from '@/lib/labels';

export function BookingOption({ booking }) {
  const money = useMoney();
  return (
    <div className="row row--between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div className="table-primary truncate">{booking.customer?.fullName}</div>
        <div className="table-secondary">
          {booking.bookingNumber} · {labelOf(EVENT_TYPES, booking.eventType)} · {formatDate(booking.eventDate)}
          {booking.hall?.name ? ` · ${booking.hall.name}` : ''}
        </div>
      </div>
      {booking.totals && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className={booking.totals.balance > 0 ? 'text-danger strong tabular' : 'text-success strong tabular'}>{money.format(Math.max(0, booking.totals.balance))}</div>
          <div className="table-secondary">remaining</div>
        </div>
      )}
    </div>
  );
}

/**
 * Picks a booking by customer name, phone or booking number.
 * @param {{ value: any, onChange: (booking: any|null) => void, filters?: Record<string, unknown>, placeholder?: string, invalid?: boolean }} props
 */
export function BookingPicker({ value, onChange, filters = {}, placeholder = 'Search by customer, phone or booking no.', invalid, id }) {
  if (value) {
    return (
      <div className="selected-entity">
        <div className="selected-entity__body">
          <BookingOption booking={value} />
        </div>
        {value.status && <BookingStatusBadge status={value.status} />}
        <IconButton icon={X} label="Change booking" size="sm" variant="ghost" onClick={() => onChange(null)} />
      </div>
    );
  }
  return (
    <AsyncCombobox
      id={id}
      queryKey={`bookings:${JSON.stringify(filters)}`}
      fetchOptions={(q) => bookingsApi.list({ q, limit: 8, ...filters }).then((response) => response.data)}
      onSelect={onChange}
      renderOption={(booking) => <BookingOption booking={booking} />}
      placeholder={placeholder}
      emptyText="No bookings match"
      invalid={invalid}
    />
  );
}
