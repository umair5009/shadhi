import { addDays, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns';

// Pure helpers for laying out the calendar views.

export const DAY_START_HOUR = 8; // 8 am
export const DAY_END_HOUR = 26; // 2 am next day — late wedding functions run past midnight
export const HOUR_HEIGHT = 46;

const toDate = (text) => parseISO(text.slice(0, 10));
const toText = (date) => format(date, 'yyyy-MM-dd');

export function visibleRange(view, anchor) {
  const date = toDate(anchor);
  if (view === 'day') return { from: anchor, to: anchor };
  if (view === 'week') {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { from: toText(start), to: toText(addDays(start, 6)) };
  }
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  return { from: toText(start), to: toText(end) };
}

export function shiftAnchor(view, anchor, direction) {
  const date = toDate(anchor);
  if (view === 'day') return toText(addDays(date, direction));
  if (view === 'week') return toText(addDays(date, direction * 7));
  return toText(new Date(date.getFullYear(), date.getMonth() + direction, 1));
}

export function rangeTitle(view, anchor) {
  const date = toDate(anchor);
  if (view === 'day') return format(date, 'EEEE, d MMMM yyyy');
  if (view === 'week') {
    const { from, to } = visibleRange('week', anchor);
    return `${format(toDate(from), 'd MMM')} – ${format(toDate(to), 'd MMM yyyy')}`;
  }
  return format(date, 'MMMM yyyy');
}

/** Weeks (arrays of 7 day objects) covering the month of `anchor`. */
export function monthGrid(anchor) {
  const { from } = visibleRange('month', anchor);
  const month = toDate(anchor);
  const weeks = [];
  let cursor = toDate(from);
  while (weeks.length < 6) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      week.push({ date: toText(cursor), inMonth: isSameMonth(cursor, month), day: cursor.getDate() });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (!isSameMonth(cursor, month) && cursor > month) break;
  }
  return weeks;
}

export function daysOfWeek(anchor) {
  const { from } = visibleRange('week', anchor);
  return Array.from({ length: 7 }, (_, index) => toText(addDays(toDate(from), index)));
}

const minutes = (time) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};

/** Start/end in minutes from midnight of the event day; an end before the start means the next day. */
export function eventMinutes(event) {
  const start = minutes(event.startTime);
  let end = minutes(event.endTime);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/**
 * Positions events in a time column. Overlapping events share the width side by side.
 * @returns {{ event: object, top: number, height: number, lane: number, lanes: number }[]}
 */
export function layoutColumn(events) {
  const sorted = [...events].map((event) => ({ event, ...eventMinutes(event) })).sort((a, b) => a.start - b.start || b.end - a.end);
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((item) => item.lane + 1));
    for (const item of cluster) placed.push({ ...item, lanes });
    cluster = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) flush();
    const laneEnds = [];
    for (const other of cluster) laneEnds[other.lane] = Math.max(laneEnds[other.lane] ?? 0, other.end);
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();

  const dayStart = DAY_START_HOUR * 60;
  const dayEnd = DAY_END_HOUR * 60;
  return placed.map((item) => {
    const start = Math.max(dayStart, Math.min(item.start, dayEnd - 30));
    const end = Math.min(dayEnd, Math.max(item.end, start + 30));
    return { event: item.event, lane: item.lane, lanes: item.lanes, top: ((start - dayStart) / 60) * HOUR_HEIGHT, height: ((end - start) / 60) * HOUR_HEIGHT };
  });
}

export function hourLabels() {
  return Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => {
    const hour = (DAY_START_HOUR + index) % 24;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${((hour + 11) % 12) + 1} ${suffix}`;
  });
}

/** 'HH:mm' for a click at `offsetY` pixels inside a time column (snapped to 30 minutes). */
export function timeAtOffset(offsetY) {
  const totalMinutes = DAY_START_HOUR * 60 + Math.floor(offsetY / (HOUR_HEIGHT / 2)) * 30;
  const hours = Math.floor(totalMinutes / 60) % 24;
  return `${String(hours).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}
