import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { staffApi } from '@/api/endpoints';
import { useListParams, useToday } from '@/lib/hooks';
import { shiftDay } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { ATTENDANCE_STATUSES, ATTENDANCE_TONES, STAFF_POSITIONS, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Controls';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';

const NEEDS_TIME = new Set(['present', 'late', 'half_day']);

/** What the sheet shows for an employee before anyone edits it. */
function savedMark(row) {
  return {
    status: row.record?.status ?? (row.staff.status === 'on_leave' ? 'leave' : ''),
    checkIn: row.record?.checkIn ?? '',
    checkOut: row.record?.checkOut ?? '',
    notes: row.record?.notes ?? '',
  };
}

/** Editable sheet for one day. Keyed by date + data version, so it always starts from what is saved. */
function AttendanceSheet({ date, data }) {
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState(() => Object.fromEntries(data.rows.map((row) => [row.staff._id, savedMark(row)])));
  const [saving, setSaving] = useState(false);

  const setMark = (staffId, patch) => setMarks((current) => ({ ...current, [staffId]: { ...current[staffId], ...patch } }));
  const unmarked = Object.values(marks).filter((mark) => !mark.status).length;
  const dirty = data.rows.some((row) => {
    const saved = savedMark(row);
    const mark = marks[row.staff._id];
    return mark.status !== saved.status || mark.checkIn !== saved.checkIn || mark.checkOut !== saved.checkOut;
  });

  const markRestPresent = () => {
    setMarks((current) => Object.fromEntries(Object.entries(current).map(([id, mark]) => [id, mark.status ? mark : { ...mark, status: 'present', checkIn: mark.checkIn || '10:00' }])));
  };

  const save = async () => {
    const entries = Object.entries(marks)
      .filter(([, mark]) => mark.status)
      .map(([staff, mark]) => ({ staff, status: mark.status, checkIn: NEEDS_TIME.has(mark.status) ? mark.checkIn : '', checkOut: NEEDS_TIME.has(mark.status) ? mark.checkOut : '', notes: mark.notes }));
    if (!entries.length) {
      toast.error('Mark at least one employee');
      return;
    }
    setSaving(true);
    try {
      await staffApi.saveAttendance({ date, entries });
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success(`Attendance saved for ${formatDate(date, 'd MMM')}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (data.rows.length === 0) return <EmptyState title="No employees on this date" />;

  return (
    <>
      <div className="toolbar">
        <div className="row">
          {ATTENDANCE_STATUSES.map((status) => {
            const count = Object.values(marks).filter((mark) => mark.status === status.value).length;
            return count ? (
              <Badge key={status.value} tone={ATTENDANCE_TONES[status.value]}>
                {count} {status.label.toLowerCase()}
              </Badge>
            ) : null;
          })}
          {unmarked > 0 && <Badge tone="outline">{unmarked} not marked</Badge>}
        </div>
        <div className="toolbar__spacer" />
        <Button icon={CheckCheck} onClick={markRestPresent} disabled={!unmarked}>
          Mark the rest present
        </Button>
        <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
          Save attendance
        </Button>
      </div>
      <div className="table-wrap">
        <table className="table table--cards">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Status</th>
              <th style={{ width: 130 }}>In</th>
              <th style={{ width: 130 }}>Out</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(({ staff }) => {
              const mark = marks[staff._id];
              return (
                <tr key={staff._id}>
                  <td className="cell--title">
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <Avatar name={staff.name} />
                      <div>
                        <div className="table-primary">{staff.name}</div>
                        <div className="table-secondary">
                          {labelOf(STAFF_POSITIONS, staff.position)} · {staff.employeeCode}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="cell--actions">
                    <div className="attendance-options" role="radiogroup" aria-label={`${staff.name} attendance`}>
                      {ATTENDANCE_STATUSES.map((status) => (
                        <button
                          key={status.value}
                          type="button"
                          role="radio"
                          aria-checked={mark.status === status.value}
                          className={`attendance-option attendance-option--${ATTENDANCE_TONES[status.value]}`}
                          onClick={() => setMark(staff._id, { status: status.value, checkIn: NEEDS_TIME.has(status.value) ? mark.checkIn || '10:00' : '' })}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td data-label="Check-in">
                    <input className="input" type="time" aria-label="Check-in" disabled={!NEEDS_TIME.has(mark.status)} value={mark.checkIn} onChange={(event) => setMark(staff._id, { checkIn: event.target.value })} style={{ height: 34 }} />
                  </td>
                  <td data-label="Check-out">
                    <input className="input" type="time" aria-label="Check-out" disabled={!NEEDS_TIME.has(mark.status)} value={mark.checkOut} onChange={(event) => setMark(staff._id, { checkOut: event.target.value })} style={{ height: 34 }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** One screen to mark everyone for a day: tap a status per person, or mark everyone present. */
export function AttendancePage() {
  const today = useToday();
  const [params, setParams] = useListParams({});
  const date = params.date || today;
  const sheet = useQuery({ queryKey: ['staff', 'attendance', date], queryFn: () => staffApi.attendanceSheet(date) });

  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark who came in. Changes are saved when you press Save." breadcrumbs={[{ label: 'Employees', to: '/staff' }, { label: 'Attendance' }]} />
      <Card>
        <div className="toolbar">
          <IconButton icon={ChevronLeft} label="Previous day" size="sm" variant="ghost" onClick={() => setParams({ date: shiftDay(date, -1) })} />
          <input className="input" type="date" value={date} max={today} onChange={(event) => setParams({ date: event.target.value || undefined })} aria-label="Date" style={{ width: 170 }} />
          <IconButton icon={ChevronRight} label="Next day" size="sm" variant="ghost" disabled={date >= today} onClick={() => setParams({ date: shiftDay(date, 1) })} />
          <strong>{formatDate(date, 'EEEE, d MMMM yyyy')}</strong>
        </div>
        {sheet.isLoading ? (
          <PageLoader />
        ) : sheet.isError ? (
          <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} />
        ) : (
          <AttendanceSheet key={`${date}:${sheet.dataUpdatedAt}`} date={date} data={sheet.data} />
        )}
      </Card>
    </>
  );
}
