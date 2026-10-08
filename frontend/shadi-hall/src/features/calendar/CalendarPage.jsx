import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import clsx from 'clsx';
import { bookingsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useHalls } from '@/features/halls/useHalls';
import { useIsPhone, useListParams, useToday } from '@/lib/hooks';
import { formatDate, formatTime, formatNumber } from '@/lib/format';
import { EVENT_TYPES, BOOKING_STATUSES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Controls';
import { ErrorState } from '@/components/ui/Feedback';
import { FilterSelect } from '@/components/ui/Filters';
import { PhoneDay, PhoneMonth, PhoneWeek } from './PhoneCalendar';
import { HOUR_HEIGHT, DAY_END_HOUR, DAY_START_HOUR, daysOfWeek, hourLabels, layoutColumn, monthGrid, rangeTitle, shiftAnchor, timeAtOffset, visibleRange } from './calendarLayout';

const VIEWS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function eventTitle(event) {
  return `${labelOf(EVENT_TYPES, event.eventType)} · ${event.customer?.fullName} · ${formatTime(event.startTime)}–${formatTime(event.endTime)} · ${event.hall?.name} · ${labelOf(BOOKING_STATUSES, event.status)}`;
}

function EventChip({ event, onOpen }) {
  return (
    <button type="button" className={`cal-chip cal-chip--${event.status}`} style={{ '--hall': event.hall?.color }} title={eventTitle(event)} onClick={(click) => { click.stopPropagation(); onOpen(event); }}>
      <span className="cal-chip__time">{formatTime(event.startTime)}</span>
      <span className="truncate">{event.customer?.fullName}</span>
    </button>
  );
}

function MonthView({ anchor, events, today, onOpen, onDay, onCreate }) {
  const byDay = new Map();
  for (const event of events) {
    const key = String(event.eventDate).slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }
  return (
    <div className="cal-month">
      {WEEKDAYS.map((day) => (
        <div key={day} className="cal-month__weekday">
          {day}
        </div>
      ))}
      {monthGrid(anchor)
        .flat()
        .map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          return (
            <div
              key={cell.date}
              className={clsx('cal-day', !cell.inMonth && 'cal-day--outside', cell.date === today && 'cal-day--today', cell.date < today && 'cal-day--past')}
              onClick={() => (onCreate && cell.date >= today ? onCreate(cell.date) : onDay(cell.date))}
            >
              <button type="button" className="cal-day__number" onClick={(click) => { click.stopPropagation(); onDay(cell.date); }} aria-label={`Open ${formatDate(cell.date, 'd MMMM')}`}>
                {cell.day}
              </button>
              <div className="cal-day__events">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventChip key={event._id} event={event} onOpen={onOpen} />
                ))}
                {dayEvents.length > 3 && (
                  <button type="button" className="cal-day__more" onClick={(click) => { click.stopPropagation(); onDay(cell.date); }}>
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
              {onCreate && cell.date >= today && <Plus size={14} className="cal-day__add" aria-hidden />}
            </div>
          );
        })}
    </div>
  );
}

/** Time grid: columns are days (week view) or halls (day view). */
function TimeGrid({ columns, onOpen, onSlot }) {
  const hours = hourLabels();
  return (
    <div className="cal-grid-wrap">
      <div className="cal-grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(140px, 1fr))` }}>
        <div className="cal-grid__corner" />
        {columns.map((column) => (
          <div key={column.key} className={clsx('cal-grid__head', column.highlight && 'cal-grid__head--today')}>
            {column.color && <span className="color-dot" style={{ background: column.color }} aria-hidden />}
            {column.label}
            {column.sublabel && <span className="table-secondary">{column.sublabel}</span>}
          </div>
        ))}
        <div className="cal-grid__hours" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT }}>
          {hours.map((label) => (
            <div key={label} style={{ height: HOUR_HEIGHT }}>
              {label}
            </div>
          ))}
        </div>
        {columns.map((column) => (
          <div
            key={column.key}
            className={clsx('cal-grid__column', column.past && 'cal-grid__column--past')}
            style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT, backgroundSize: `100% ${HOUR_HEIGHT}px` }}
            onClick={onSlot && !column.past ? (click) => onSlot(column, timeAtOffset(click.nativeEvent.offsetY)) : undefined}
          >
            {layoutColumn(column.events).map(({ event, top, height, lane, lanes }) => (
              <button
                key={event._id}
                type="button"
                className={`cal-block cal-block--${event.status}`}
                style={{ '--hall': event.hall?.color, top, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                title={eventTitle(event)}
                onClick={(click) => {
                  click.stopPropagation();
                  onOpen(event);
                }}
              >
                <span className="cal-block__time">
                  {formatTime(event.startTime)} – {formatTime(event.endTime)}
                </span>
                <span className="cal-block__title">{event.customer?.fullName}</span>
                <span className="cal-block__meta">
                  {labelOf(EVENT_TYPES, event.eventType)} · {formatNumber(event.guestCount)} guests
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULTS = { view: 'month' };

export function CalendarPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const today = useToday();
  const isPhone = useIsPhone();
  const halls = useHalls();
  const [params, setParams] = useListParams(DEFAULTS);
  const view = params.view;
  const anchor = params.date ?? today;
  const range = visibleRange(view, anchor);

  const events = useQuery({
    queryKey: ['bookings', 'calendar', range, params.hall],
    queryFn: () => bookingsApi.calendar({ ...range, hall: params.hall }),
    placeholderData: keepPreviousData,
  });
  const list = events.data ?? [];

  const openEvent = (event) => navigate(`/bookings/${event._id}`);
  const openDay = (date) => setParams({ view: 'day', date });
  const canCreate = can('bookings.create');
  const create = (date, hall, startTime) => {
    const query = new URLSearchParams({ date, ...(hall ? { hall } : {}), ...(startTime ? { start: startTime } : {}) });
    navigate(`/bookings/new?${query}`);
  };

  const visibleHalls = (halls.data ?? []).filter((hall) => !params.hall || hall._id === params.hall);
  let columns = [];
  if (view === 'week') {
    columns = daysOfWeek(anchor).map((date) => ({
      key: date,
      date,
      label: formatDate(date, 'EEE d'),
      highlight: date === today,
      past: date < today,
      events: list.filter((event) => String(event.eventDate).slice(0, 10) === date),
    }));
  } else if (view === 'day') {
    columns = visibleHalls.map((hall) => ({
      key: hall._id,
      date: anchor,
      hall: hall._id,
      label: hall.name,
      sublabel: `${formatNumber(hall.capacity)} guests`,
      color: hall.color,
      past: anchor < today,
      events: list.filter((event) => event.hall?._id === hall._id),
    }));
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Every event across your halls. Solid = confirmed, striped = tentative, outlined = inquiry."
        actions={
          canCreate && (
            <Button variant="primary" icon={Plus} onClick={() => create(anchor >= today ? anchor : today, params.hall)}>
              New booking
            </Button>
          )
        }
      />
      <Card>
        <div className="toolbar">
          <Button size="sm" onClick={() => setParams({ date: undefined })}>
            Today
          </Button>
          <IconButton icon={ChevronLeft} label="Previous" size="sm" variant="ghost" onClick={() => setParams({ date: shiftAnchor(view, anchor, -1) })} />
          <IconButton icon={ChevronRight} label="Next" size="sm" variant="ghost" onClick={() => setParams({ date: shiftAnchor(view, anchor, 1) })} />
          <h2 className="cal-title">{rangeTitle(view, anchor)}</h2>
          <div className="toolbar__spacer" />
          <FilterSelect label="Halls" value={params.hall} options={(halls.data ?? []).map((hall) => ({ value: hall._id, label: hall.name }))} onChange={(hall) => setParams({ hall, date: params.date })} />
          <Segmented label="Calendar view" options={VIEWS} value={view} onChange={(next) => setParams({ view: next, date: params.date })} />
        </div>
        <div className="cal-legend">
          {(halls.data ?? []).map((hall) => (
            <span key={hall._id} className="hall-chip">
              <span className="color-dot" style={{ background: hall.color }} aria-hidden /> {hall.name}
            </span>
          ))}
        </div>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : (
          <div className={events.isFetching && events.isPlaceholderData ? 'is-refreshing' : undefined}>
            {isPhone ? (
              view === 'month' ? (
                <PhoneMonth key={anchor.slice(0, 7)} anchor={anchor} events={list} today={today} onCreate={canCreate ? (date) => create(date, params.hall) : null} />
              ) : view === 'week' ? (
                <PhoneWeek anchor={anchor} events={list} today={today} onCreate={canCreate ? (date) => create(date, params.hall) : null} />
              ) : (
                <PhoneDay date={anchor} halls={visibleHalls} events={list} today={today} onCreate={canCreate ? (date, hall) => create(date, hall) : null} />
              )
            ) : view === 'month' ? (
              <MonthView anchor={anchor} events={list} today={today} onOpen={openEvent} onDay={openDay} onCreate={canCreate ? (date) => create(date, params.hall) : null} />
            ) : (
              <TimeGrid columns={columns} onOpen={openEvent} onSlot={canCreate ? (column, time) => create(column.date, column.hall ?? params.hall, time) : null} />
            )}
            {!isPhone && view === 'day' && list.length === 0 && <p className="muted" style={{ padding: 16, textAlign: 'center' }}>All halls are free on this day. Click a time to start a booking.</p>}
          </div>
        )}
      </Card>
    </>
  );
}
