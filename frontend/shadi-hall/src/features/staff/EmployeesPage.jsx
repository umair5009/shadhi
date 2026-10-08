import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BriefcaseBusiness, ClipboardCheck, Plus, Banknote, Users } from 'lucide-react';
import { staffApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams, useMoney } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { STAFF_POSITIONS, STAFF_STATUSES, STAFF_STATUS_TONES, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Avatar } from '@/components/ui/Controls';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterSelect } from '@/components/ui/Filters';
import { EmployeeFormDialog } from './EmployeeFormDialog';

export function EmployeesPage() {
  const navigate = useNavigate();
  const money = useMoney();
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useListParams({ page: 1, status: 'active,on_leave' });
  const query = { page: params.page, limit: 50, sort: params.sort, q: params.q, position: params.position, status: params.status };
  const staff = useQuery({ queryKey: ['staff', 'list', query], queryFn: () => staffApi.list(query), placeholderData: keepPreviousData });
  const showSalary = can('staff.salaries');

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      sortKey: 'name',
      render: (row) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Avatar name={row.name} />
          <div>
            <div className="table-primary">{row.name}</div>
            <div className="table-secondary">{row.employeeCode}</div>
          </div>
        </div>
      ),
    },
    { key: 'position', header: 'Position', render: (row) => labelOf(STAFF_POSITIONS, row.position) },
    { key: 'phone', header: 'Phone', render: (row) => row.phone || '—' },
    { key: 'joiningDate', header: 'Joined', sortKey: 'joiningDate', render: (row) => formatDate(row.joiningDate) },
    ...(showSalary ? [{ key: 'salary', header: 'Salary', align: 'right', sortKey: 'salary', render: (row) => money.format(row.salary) }] : []),
    { key: 'status', header: 'Status', render: (row) => <Badge tone={STAFF_STATUS_TONES[row.status]} dot>{labelOf(STAFF_STATUSES, row.status)}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Your team, their roles and salaries"
        actions={
          <>
            {can('staff.attendance') && (
              <Button icon={ClipboardCheck} to="/staff/attendance">
                Attendance
              </Button>
            )}
            {showSalary && (
              <Button icon={Banknote} to="/staff/salaries">
                Salaries
              </Button>
            )}
            {can('staff.manage') && (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add employee
              </Button>
            )}
          </>
        }
      />
      <div className="stack">
        {staff.data?.summary && (
          <div className="grid grid--2">
            <StatCard label="Current team" icon={Users} value={staff.data.summary.headcount} meta="Active and on leave" />
            {showSalary && <StatCard label="Monthly payroll" icon={Banknote} tone="gold" value={money.format(staff.data.summary.monthlyPayroll)} meta="Sum of monthly salaries" />}
          </div>
        )}
        <Card>
          <div className="toolbar">
            <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search name, phone, code or CNIC" />
            <FilterSelect label="Positions" allLabel="All positions" value={params.position} options={toOptions(STAFF_POSITIONS)} onChange={(position) => setParams({ position })} />
            <FilterSelect
              label="Status"
              allLabel="Everyone (incl. left)"
              value={params.status}
              options={[{ value: 'active,on_leave', label: 'Current team' }, ...toOptions(STAFF_STATUSES)]}
              onChange={(status) => setParams({ status: status ?? null })}
            />
          </div>
          <DataTable
            columns={columns}
            rows={staff.data?.data}
            loading={staff.isLoading}
            refreshing={staff.isFetching && !staff.isLoading}
            error={staff.error}
            onRetry={() => staff.refetch()}
            sort={params.sort}
            onSortChange={(sort) => setParams({ sort })}
            onRowClick={(row) => navigate(`/staff/${row._id}`)}
            empty={<EmptyState icon={BriefcaseBusiness} title="No employees found" />}
          />
          <Pagination meta={staff.data?.meta} onPageChange={(page) => setParams({ page })} />
        </Card>
      </div>
      <EmployeeFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(employee) => navigate(`/staff/${employee._id}`)} />
    </>
  );
}
