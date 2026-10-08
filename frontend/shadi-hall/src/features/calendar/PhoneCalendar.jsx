import { useState } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { CalendarPlus, CircleCheck } from 'lucide-react';
import { formatDate, formatNumber, formatTimeRange } from '@/lib/format';
import { EVENT_TYPES, labelOf } from '@/lib/labels';
import { BookingStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { daysOfWeek, monthGrid } from './calendarLayout';

// Phone layouts for the calendar: a month grid of dots with the chosen day's list underneath, a week agenda, and a
// per-hall day view that answers "which hall is free?" without horizontal scrolling.

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const dayOf = (event) => String(event.eventDate).slice(0, 10);

function groupByDay(events) {
  const map = new Map();
  for (const event of events) map.set(dayOf(event), [...(map.get(dayOf(event)) ?? []), event]);
  return map;
}

function AgendaEvent({ event }) {
  return (
    <Link to={`/bookings/${event._id}`} className={`agenda-event agenda-event--${event.status}`} style={{ '--hall': event.hall?.color }}>
      <span className="agenda-event__time">{formatTimeRange(event.startTime, event.endTime)}</span>
      <span className="agenda-event__title">{event.customer?.fullName}</span>
      <span className="agenda-event__meta">
        {labelOf(EVENT_TYPES, event.eventType)} · {event.hall?.name} · {formatNumber(event.guestCount)} guests
      </span>
      <span className="agenda-event__status">
        <BookingStatusBadge status={event.status} />
      </span>
    </Link>
  );
}

function DayList({ date, events, today, onCreate }) {
  return (
    <div className="agenda-day">
      <div className="agenda-day__head">
        <strong>{formatDate(date, 'EEEE, d MMMM')}</strong>
        {onCreate && date >= today && (
          <Button size="sm" variant="subtle" icon={CalendarPlus} onClick={() => onCreate(date)}>
            Book
          </Button>
        )}
      </div>
      {events.length ? events.map((event) => <AgendaEvent key={event._id} event={event} />) : <p className="agenda-day__empty">No events — all halls free.</p>}
    </div>
  );
}

export function PhoneMonth({ anchor, events, today, onCreate }) {
  const byDay = groupByDay(events);
  const cells = monthGrid(anchor).flat();
  const inMonth = (date) => cells.some((cell) => cell.date === date && cell.inMonth);
  const [selected, setSelected] = useState(inMonth(today) ? today : `${anchor.slice(0, 7)}-01`);

  return (
    <div>
      <div className="cal-phone-month">
        {WEEKDAYS.map((day, index) => (
          <div key={index} className="cal-phone-month__weekday">
            {day}
          </div>
        ))}
        {cells.map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          return (
            <button
              key={cell.date}
              type="button"
              className={clsx('cal-phone-day', !cell.inMonth && 'cal-phone-day--outside', cell.date === today && 'cal-phone-day--today', cell.date === selected && 'cal-phone-day--selected')}
              onClick={() => setSelected(cell.date)}
              aria-label={`${formatDate(cell.date, 'd MMMM')}: ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
              aria-pressed={cell.date === selected}
            >
              <span className="cal-phone-day__number">{cell.day}</span>
              <span className="cal-phone-day__dots" aria-hidden>
                {dayEvents.slice(0, 3).map((event) => (
                  <span key={event._id} className={`cal-dot cal-dot--${event.status}`} style={{ '--hall': event.hall?.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <DayList date={selected} events={byDay.get(selected) ?? []} today={today} onCreate={onCreate} />
    </div>
  );
}

export function PhoneWeek({ anchor, events, today, onCreate }) {
  const byDay = groupByDay(events);
  return (
    <div>
      {daysOfWeek(anchor).map((date) => (
        <DayList key={date} date={date} events={byDay.get(date) ?? []} today={today} onCreate={onCreate} />
      ))}
    </div>
  );
}

export function PhoneDay({ date, halls, events, today, onCreate }) {
  return (
    <div>
      {halls.map((hall) => {
        const hallEvents = events.filter((event) => event.hall?._id === hall._id);
        return (
          <div key={hall._id} className="agenda-day">
            <div className="agenda-day__head">
              <span className="hall-chip" style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--ink)' }}>
                <span className="color-dot" style={{ background: hall.color }} aria-hidden /> {hall.name}
              </span>
              {hallEvents.length === 0 ? (
                <span className="text-success strong row" style={{ gap: 4, fontSize: 'var(--text-sm)' }}>
                  <CircleCheck size={15} aria-hidden /> Free all day
                </span>
              ) : (
                <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {hallEvents.length} event{hallEvents.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {hallEvents.map((event) => (
              <AgendaEvent key={event._id} event={event} />
            ))}
            {onCreate && date >= today && (
              <Button size="sm" variant="ghost" icon={CalendarPlus} onClick={() => onCreate(date, hall._id)}>
                Book {hall.name}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
