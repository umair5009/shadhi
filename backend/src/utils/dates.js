// Date conventions
// - "Business dates" (event day, payment day, expense day…) are calendar days stored as UTC midnight.
//   2026-10-03 is stored as 2026-10-03T00:00:00.000Z regardless of timezone.
// - "Instants" (booking startAt/endAt) are real moments, computed from a local date + time in the
//   organization's timezone.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isDateOnlyString(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** '2026-10-03' | Date → Date at UTC midnight of that calendar day. */
function toDateOnly(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (!isDateOnlyString(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date (UTC midnight) → '2026-10-03' */
function formatDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(new Date(date).getTime() + days * DAY_MS);
}

function addMonthsDateOnly(date, months) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function startOfMonthDateOnly(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthDateOnly(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function daysBetween(from, to) {
  return Math.round((toDateOnly(new Date(to)).getTime() - toDateOnly(new Date(from)).getTime()) / DAY_MS);
}

/** Offset (ms) between the wall clock in `timeZone` and UTC at the given instant. */
function timeZoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Local calendar day + 'HH:mm' in `timeZone` → UTC instant. */
function zonedDateTimeToUtc(dateOnly, time, timeZone) {
  const [hours, minutes] = time.split(':').map(Number);
  const day = toDateOnly(dateOnly);
  const naiveUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);
  // Two passes handle DST transitions where the offset differs either side of the moment.
  let result = naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone);
  result = naiveUtc - timeZoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Today's calendar day in `timeZone`, as a UTC-midnight Date. */
function todayInTimeZone(timeZone, now = new Date()) {
  const text = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return toDateOnly(text);
}

/**
 * Start/end instants of an event. An end time earlier than (or equal to) the start time means the event runs past
 * midnight — common for baraat/walima functions that finish at 1 am.
 */
function eventWindow(eventDate, startTime, endTime, timeZone) {
  const dateText = typeof eventDate === 'string' ? eventDate : formatDateOnly(eventDate);
  const startAt = zonedDateTimeToUtc(dateText, startTime, timeZone);
  const endDateText = endTime <= startTime ? formatDateOnly(addDays(toDateOnly(dateText), 1)) : dateText;
  const endAt = zonedDateTimeToUtc(endDateText, endTime, timeZone);
  return { startAt, endAt };
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Resolves a named period ('today' | 'week' | 'month' | 'year' | 'custom') into an inclusive date-only range. */
function resolvePeriod({ period = 'month', from, to }, timeZone) {
  const today = todayInTimeZone(timeZone);
  switch (period) {
    case 'today':
      return { from: today, to: today, label: 'Today' };
    case 'week': {
      const weekday = (today.getUTCDay() + 6) % 7; // Monday = 0
      const start = addDays(today, -weekday);
      return { from: start, to: addDays(start, 6), label: 'This week' };
    }
    case 'year':
      return {
        from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)),
        to: new Date(Date.UTC(today.getUTCFullYear(), 11, 31)),
        label: 'This year',
      };
    case 'last_month': {
      const start = addMonthsDateOnly(today, -1);
      return { from: start, to: endOfMonthDateOnly(start), label: 'Last month' };
    }
    case 'custom': {
      const start = from ? toDateOnly(from) : startOfMonthDateOnly(today);
      const end = to ? toDateOnly(to) : today;
      return { from: start, to: end, label: `${formatDateOnly(start)} – ${formatDateOnly(end)}` };
    }
    case 'month':
    default:
      return { from: startOfMonthDateOnly(today), to: endOfMonthDateOnly(today), label: 'This month' };
  }
}

module.exports = {
  DAY_MS,
  isDateOnlyString,
  toDateOnly,
  formatDateOnly,
  addDays,
  addMonthsDateOnly,
  startOfMonthDateOnly,
  endOfMonthDateOnly,
  daysBetween,
  zonedDateTimeToUtc,
  todayInTimeZone,
  eventWindow,
  isValidTimeZone,
  resolvePeriod,
};
