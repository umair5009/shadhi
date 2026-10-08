import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { hallsApi } from '@/api/endpoints';
import { useHalls } from '@/features/halls/useHalls';
import { useMoney } from '@/lib/hooks';
import { formatNumber, formatTimeRange } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Feedback';

const STATUS = {
  available: { label: 'Available', tone: 'success' },
  held: { label: 'On hold', tone: 'warning' },
  booked: { label: 'Booked', tone: 'danger' },
  unavailable: { label: 'Maintenance', tone: 'neutral' },
};

/**
 * Hall cards with live availability for the chosen date and time.
 * Booked halls stay selectable for inquiries/holds; the API refuses a confirmed double booking.
 */
export function HallChooser({ value, onChange, date, startTime, endTime, excludeBooking, guestCount }) {
  const money = useMoney();
  const halls = useHalls();
  const ready = Boolean(date && startTime && endTime);
  const availability = useQuery({
    queryKey: ['halls', 'availability', date, startTime, endTime, excludeBooking],
    queryFn: () => hallsApi.availability({ date, startTime, endTime, excludeBooking }),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const rows = ready && availability.data ? availability.data : (halls.data ?? []).map((hall) => ({ hall, status: null, conflicts: [], holds: [] }));

  if (halls.isLoading) return <Skeleton height={96} />;

  return (
    <div className="stack stack--sm">
      {!ready && <p className="field__hint">Pick the date and time to see which halls are free.</p>}
      <div className="hall-options" role="radiogroup" aria-label="Hall">
        {rows.map(({ hall, status, conflicts, holds }) => {
          const selected = String(value) === String(hall._id);
          const overCapacity = guestCount > hall.capacity;
          return (
            <button
              key={hall._id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`hall-option${selected ? ' hall-option--selected' : ''}${status === 'booked' ? ' hall-option--booked' : ''}`}
              onClick={() => onChange(hall)}
            >
              <span className="hall-option__stripe" style={{ background: hall.color }} aria-hidden />
              <span className="hall-option__top">
                <span className="hall-option__name">{hall.name}</span>
                {status && (
                  <Badge tone={STATUS[status].tone} dot>
                    {STATUS[status].label}
                  </Badge>
                )}
              </span>
              <span className="hall-option__meta">
                <Users size={13} aria-hidden /> {formatNumber(hall.capacity)} guests · {money.format(hall.basePrice)}
              </span>
              {overCapacity && <span className="hall-option__warning">Too small for {formatNumber(guestCount)} guests</span>}
              {[...conflicts, ...holds].slice(0, 2).map((booking) => (
                <span key={booking._id} className="hall-option__conflict">
                  {booking.customer?.fullName ?? booking.bookingNumber} · {formatTimeRange(booking.startTime, booking.endTime)}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
