import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { staffApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useMoney } from '@/lib/hooks';
import { formatDate, formatTime } from '@/lib/format';
import { ATTENDANCE_STATUSES, ATTENDANCE_TONES, PAYMENT_METHODS, STAFF_POSITIONS, STAFF_STATUSES, STAFF_STATUS_TONES, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/Controls';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { EmployeeFormDialog } from './EmployeeFormDialog';

export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const money = useMoney();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: ['staff', id], queryFn: () => staffApi.get(id) });
  const remove = useApiMutation(() => staffApi.remove(id), { success: 'Employee deleted', invalidate: [['staff']], onSuccess: () => navigate('/staff') });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const employee = query.data;
  const { attendance } = employee;

  const askDelete = async () => {
    const ok = await confirm({
      title: `Delete ${employee.name}?`,
      message: 'Employees with attendance or salary records can’t be deleted — set their status to “Left / terminated” instead.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Employees', to: '/staff' }, { label: employee.name }]}
        title={
          <>
            {employee.name}
            <Badge tone={STAFF_STATUS_TONES[employee.status]} dot>
              {labelOf(STAFF_STATUSES, employee.status)}
            </Badge>
          </>
        }
        subtitle={`${labelOf(STAFF_POSITIONS, employee.position)} · ${employee.employeeCode}`}
        actions={
          can('staff.manage') && (
            <>
              <Button variant="ghost" icon={Trash2} onClick={askDelete}>
                Delete
              </Button>
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )
        }
      />
      <div className="split split--aside-first">
        <div className="stack">
          <Card>
            <CardHeader title={`Attendance · ${formatDate(`${attendance.month}-01`, 'MMMM yyyy')}`} />
            <CardBody>
              <div className="attendance-counts">
                {ATTENDANCE_STATUSES.map((status) => (
                  <div key={status.value}>
                    <Badge tone={ATTENDANCE_TONES[status.value]}>{status.label}</Badge>
                    <strong>{attendance.counts[status.value]}</strong>
                  </div>
                ))}
              </div>
            </CardBody>
            <DataTable
              compact
              columns={[
                { key: 'date', header: 'Date', render: (row) => formatDate(row.date, 'EEE, dd MMM') },
                { key: 'status', header: 'Status', render: (row) => <Badge tone={ATTENDANCE_TONES[row.status]}>{labelOf(ATTENDANCE_STATUSES, row.status)}</Badge> },
                { key: 'in', header: 'In', render: (row) => formatTime(row.checkIn) || '—' },
                { key: 'out', header: 'Out', render: (row) => formatTime(row.checkOut) || '—' },
                { key: 'notes', header: 'Notes', render: (row) => <span className="table-secondary">{row.notes}</span> },
              ]}
              rows={[...attendance.records].reverse()}
              empty={<EmptyState compact title="No attendance marked this month" />}
            />
          </Card>
          {can('staff.salaries') && (
            <Card>
              <CardHeader title="Salary payments" subtitle="Last 12 payments" actions={<Button size="sm" to="/staff/salaries">Payroll</Button>} />
              <DataTable
                compact
                columns={[
                  { key: 'period', header: 'Month', render: (row) => formatDate(`${row.period}-01`, 'MMM yyyy') },
                  { key: 'paidOn', header: 'Paid on', render: (row) => formatDate(row.paidOn) },
                  { key: 'method', header: 'Method', render: (row) => labelOf(PAYMENT_METHODS, row.method) },
                  { key: 'gross', header: 'Salary', align: 'right', render: (row) => money.format(row.grossAmount) },
                  { key: 'adjust', header: '+Bonus / −Deduct', align: 'right', render: (row) => (row.bonus || row.deductions ? `+${money.format(row.bonus)} / −${money.format(row.deductions)}` : '—') },
                  { key: 'net', header: 'Paid', align: 'right', render: (row) => <span className="strong">{money.format(row.netAmount)}</span> },
                ]}
                rows={employee.salaries}
                rowClassName={(row) => (row.void ? 'row--voided' : undefined)}
                empty={<EmptyState compact title="No salary paid yet" />}
              />
            </Card>
          )}
        </div>
        <Card>
          <CardBody>
            <div className="stack">
              <div className="row" style={{ gap: 12 }}>
                <Avatar name={employee.name} size="lg" />
                <div>
                  <div className="strong" style={{ fontSize: 17 }}>
                    {employee.name}
                  </div>
                  <div className="muted">{labelOf(STAFF_POSITIONS, employee.position)}</div>
                </div>
              </div>
              <dl className="details">
                <dt>Phone</dt>
                <dd>{employee.phone ? <a href={`tel:${employee.phone}`}>{employee.phone}</a> : '—'}</dd>
                <dt>CNIC</dt>
                <dd>{employee.cnic || '—'}</dd>
                <dt>Joined</dt>
                <dd>{formatDate(employee.joiningDate)}</dd>
                {can('staff.salaries') && (
                  <>
                    <dt>Salary</dt>
                    <dd className="strong">{money.format(employee.salary)} / month</dd>
                  </>
                )}
                <dt>Address</dt>
                <dd>{employee.address || '—'}</dd>
              </dl>
              {employee.notes && <p className="secondary">{employee.notes}</p>}
            </div>
          </CardBody>
        </Card>
      </div>
      <EmployeeFormDialog open={editing} onClose={() => setEditing(false)} employee={employee} />
    </>
  );
}
