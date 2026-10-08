import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

// Calendar-day helpers working on 'YYYY-MM-DD' strings, the format the API expects for business dates.

/** Today's date in the business timezone (not the browser's), as YYYY-MM-DD. */
export function todayIn(timeZone = 'Asia/Karachi') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const toDay = (date) => format(date, 'yyyy-MM-dd');
export const fromDay = (text) => parseISO(text.slice(0, 10));
export const shiftDay = (text, days) => toDay(addDays(fromDay(text), days));
export const shiftMonth = (text, months) => toDay(addMonths(fromDay(text), months));
export const monthStart = (text) => toDay(startOfMonth(fromDay(text)));
export const monthEnd = (text) => toDay(endOfMonth(fromDay(text)));
export const weekStart = (text) => toDay(startOfWeek(fromDay(text), { weekStartsOn: 1 }));
export const monthKey = (text) => text.slice(0, 7);

/** Preset ranges for report and list filters. */
export function presetRange(preset, today) {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'this_week':
      return { from: weekStart(today), to: shiftDay(weekStart(today), 6) };
    case 'this_month':
      return { from: monthStart(today), to: monthEnd(today) };
    case 'last_month': {
      const start = shiftMonth(monthStart(today), -1);
      return { from: start, to: monthEnd(start) };
    }
    case 'last_90':
      return { from: shiftDay(today, -89), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'last_12_months':
      return { from: shiftMonth(monthStart(today), -11), to: monthEnd(today) };
    default:
      return { from: undefined, to: undefined };
  }
}

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_12_months', label: 'Last 12 months' },
];
