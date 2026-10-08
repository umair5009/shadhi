import { CircleCheck, TriangleAlert, CircleAlert } from 'lucide-react';
import { useMoney } from '@/lib/hooks';
import { formatDate, formatNumber, formatTimeRange } from '@/lib/format';
import { EVENT_TYPES, labelOf } from '@/lib/labels';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Feedback';

function AvailabilityStatus({ availability, status }) {
  if (!availability) return null;
  if (availability.isFetching && !availability.data) {
    return (
      <div className="availability availability--checking">
        <Spinner size={16} /> Checking the hall…
      </div>
    );
  }
  const data = availability.data;
  if (!data) return null;
  if (!data.available) {
    const blocking = status === 'confirmed' || status === 'completed';
    return (
      <div className={`availability ${blocking ? 'availability--blocked' : 'availability--warning'}`}>
        <CircleAlert size={16} aria-hidden />
        <div>
          <strong>Hall already booked</strong>
          {data.conflicts.map((booking) => (
            <div key={booking._id} className="table-secondary">
              {booking.customer?.fullName} · {formatTimeRange(booking.startTime, booking.endTime)}
            </div>
          ))}
          {blocking ? <div>Choose another hall or time, or save as tentative.</div> : <div>You can save this as an inquiry or tentative hold.</div>}
        </div>
      </div>
    );
  }
  if (data.holds.length) {
    return (
      <div className="availability availability--warning">
        <TriangleAlert size={16} aria-hidden />
        <div>
          <strong>Free, but someone has a hold</strong>
          {data.holds.map((booking) => (
            <div key={booking._id} className="table-secondary">
              {booking.customer?.fullName} ({booking.status}) · {formatTimeRange(booking.startTime, booking.endTime)}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="availability availability--ok">
      <CircleCheck size={16} aria-hidden /> Hall is free at this time
    </div>
  );
}

/** Live booking total from the shared finance calculation — the same numbers the server will store. */
export function BookingSummary({ values, totals, issues, hall, pkg, availability, isEdit, paid = 0, submitting, onCancel }) {
  const money = useMoney();
  const advance = Number(values.advance?.amount) || 0;
  const menuLabel = values.menuMode === 'package' && pkg ? `${pkg.name} menu${pkg.pricingType === 'per_person' ? ` (${formatNumber(values.guestCount || 0)} × ${money.format(values.packageRate === '' ? pkg.price : values.packageRate)})` : ''}` : 'Food';

  return (
    <Card className="booking-summary">
      <CardHeader title="Booking summary" subtitle={values.customer?.fullName ?? 'No customer chosen yet'} />
      <CardBody>
        <div className="stack">
          <div className="booking-summary__event">
            <strong>{labelOf(EVENT_TYPES, values.eventType)}</strong>
            <span>{values.eventDate ? formatDate(values.eventDate, 'EEE, d MMM yyyy') : 'Date not set'}</span>
            <span>{values.startTime && values.endTime ? formatTimeRange(values.startTime, values.endTime) : ''}</span>
            <span>
              {hall?.name ?? 'No hall'} · {formatNumber(values.guestCount || 0)} guests
            </span>
          </div>
          <AvailabilityStatus availability={availability} status={values.status} />
          <div className="money-summary">
            {totals.hall > 0 && (
              <div className="money-summary__row">
                <span>Hall</span>
                <span>{money.format(totals.hall)}</span>
              </div>
            )}
            {totals.menu > 0 && (
              <div className="money-summary__row">
                <span className="truncate" style={{ maxWidth: 200 }} title={menuLabel}>
                  {menuLabel}
                </span>
                <span>{money.format(totals.menu)}</span>
              </div>
            )}
            {totals.services > 0 && (
              <div className="money-summary__row">
                <span>Services</span>
                <span>{money.format(totals.services)}</span>
              </div>
            )}
            {totals.decoration > 0 && (
              <div className="money-summary__row">
                <span>Decoration</span>
                <span>{money.format(totals.decoration)}</span>
              </div>
            )}
            {totals.other > 0 && (
              <div className="money-summary__row">
                <span>Other</span>
                <span>{money.format(totals.other)}</span>
              </div>
            )}
            <div className="money-summary__row">
              <span>Subtotal</span>
              <span className="strong">{money.format(totals.subtotal)}</span>
            </div>
            {totals.discount > 0 && (
              <div className="money-summary__row">
                <span>Discount</span>
                <span className="text-success">− {money.format(totals.discount)}</span>
              </div>
            )}
            {totals.tax > 0 && (
              <div className="money-summary__row">
                <span>Tax ({totals.taxRate}%)</span>
                <span>{money.format(totals.tax)}</span>
              </div>
            )}
            <div className="money-summary__row money-summary__row--total">
              <span>Grand total</span>
              <span>{money.format(totals.grandTotal)}</span>
            </div>
            {isEdit && paid > 0 && (
              <div className="money-summary__row">
                <span>Already paid</span>
                <span className="text-success">{money.format(paid)}</span>
              </div>
            )}
            {!isEdit && advance > 0 && (
              <div className="money-summary__row">
                <span>Advance now</span>
                <span className="text-success">{money.format(advance)}</span>
              </div>
            )}
            <div className={`money-summary__row money-summary__row--balance${totals.grandTotal - (isEdit ? paid : advance) <= 0 ? ' money-summary__row--settled' : ''}`}>
              <span>Remaining</span>
              <span>{money.format(Math.max(0, totals.grandTotal - (isEdit ? paid : advance)))}</span>
            </div>
          </div>
          {issues.map((issue) => (
            <p key={issue.field} className="field__error">
              {issue.message}
            </p>
          ))}
          <div className="stack stack--sm">
            <Button type="submit" form="booking-form" variant="primary" size="lg" block loading={submitting}>
              {isEdit ? 'Save changes' : 'Save booking'}
            </Button>
            <Button variant="ghost" block onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
