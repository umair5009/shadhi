import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Ban, Banknote, ChevronLeft, ChevronRight, HandCoins, Wallet } from 'lucide-react';
import { staffApi } from '@/api/endpoints';
import { useApiMutation, useListParams, useMoney, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { shiftMonth } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { money as moneyRule, dateText, optionalText } from '@/lib/validation';
import { PAYMENT_METHODS, STAFF_POSITIONS, labelOf, toOptions } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable } from '@/components/ui/DataTable';
import { ProgressBar } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Feedback';
import { DateField, MoneyField, SelectField, TextField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { useConfirm } from '@/components/ui/ConfirmProvider';

const schema = z.object({
  grossAmount: moneyRule('Salary amount', { required: true }),
  bonus: moneyRule('Bonus'),
  deductions: moneyRule('Deductions'),
  paidOn: dateText('Payment date'),
  method: z.string(),
  reference: optionalText(100),
  notes: optionalText(500),
});

function PaySalaryDialog(props) {
  return props.row ? <PaySalaryBody {...props} /> : null;
}

function PaySalaryBody({ row, period, onClose }) {
  const money = useMoney();
  const today = useToday();
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { grossAmount: row.remaining || '', bonus: '', deductions: '', paidOn: today, method: 'cash', reference: '', notes: '' },
  });
  const values = useWatch({ control: form.control });
  const net = (Number(values.grossAmount) || 0) + (Number(values.bonus) || 0) - (Number(values.deductions) || 0);

  const onSubmit = form.handleSubmit(async (formValues) => {
    try {
      const response = await staffApi.paySalary({
        staff: row.staff._id,
        period,
        grossAmount: formValues.grossAmount,
        bonus: formValues.bonus || 0,
        deductions: formValues.deductions || 0,
        paidOn: formValues.paidOn,
        method: formValues.method,
        reference: formValues.reference,
        notes: formValues.notes,
      });
      await Promise.all([['staff'], ...MONEY_QUERY_KEYS].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(`${money.format(response.data.netAmount)} paid to ${row.staff.name}`);
      for (const warning of response.meta?.warnings ?? []) toast.warning(warning);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Pay ${row.staff.name}`}
      description={`${formatDate(`${period}-01`, 'MMMM yyyy')} · salary ${money.format(row.salary)} · already paid ${money.format(row.paid)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="salary-form" variant="primary" loading={form.formState.isSubmitting} disabled={net <= 0}>
            Pay {money.format(Math.max(0, net))}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="salary-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <MoneyField name="grossAmount" label="Salary amount" required autoFocus className="span-all" hint="Pay part of the salary as an advance, or the full remaining amount" />
          <MoneyField name="bonus" label="Bonus" />
          <MoneyField name="deductions" label="Deductions" hint="e.g. absences, loan repayment" />
          <DateField name="paidOn" label="Paid on" required max={today} />
          <SelectField name="method" label="Paid by" options={toOptions(PAYMENT_METHODS)} />
          <TextField name="reference" label="Reference" />
          <TextField name="notes" label="Notes" />
        </form>
      </FormProvider>
    </Dialog>
  );
}

export function SalariesPage() {
  const money = useMoney();
  const today = useToday();
  const confirm = useConfirm();
  const [params, setParams] = useListParams({});
  const period = params.period || today.slice(0, 7);
  const [paying, setPaying] = useState(null);
  const summary = useQuery({ queryKey: ['staff', 'salaries', period], queryFn: () => staffApi.salarySummary(period) });
  const voidSalary = useApiMutation(({ id, reason }) => staffApi.voidSalary(id, { reason }), { success: 'Salary payment voided', invalidate: [['staff'], ...MONEY_QUERY_KEYS] });
  const totals = summary.data?.totals;
  const thisMonth = today.slice(0, 7);

  const askVoid = async (payment, name) => {
    const reason = await confirm({
      title: `Void salary payment to ${name}?`,
      message: `${money.format(payment.netAmount)} paid on ${formatDate(payment.paidOn)} will be voided, along with its expense entry.`,
      confirmLabel: 'Void payment',
      danger: true,
      requireReason: true,
    });
    if (reason) voidSalary.mutate({ id: payment._id, reason });
  };

  const columns = [
    {
      key: 'staff',
      header: 'Employee',
      render: (row) => (
        <>
          <div className="table-primary">{row.staff.name}</div>
          <div className="table-secondary">
            {labelOf(STAFF_POSITIONS, row.staff.position)} · {row.staff.employeeCode}
          </div>
        </>
      ),
    },
    { key: 'salary', header: 'Salary', align: 'right', render: (row) => money.format(row.salary) },
    {
      key: 'progress',
      header: 'Paid',
      render: (row) => (
        <div style={{ minWidth: 160 }}>
          <div className="row row--between" style={{ fontSize: 13 }}>
            <span className="strong">{money.format(row.paid)}</span>
            {row.netPaid !== row.paid && <span className="table-secondary">net {money.format(row.netPaid)}</span>}
          </div>
          <ProgressBar value={row.paid} max={row.salary || 1} tone={row.remaining > 0 ? 'warning' : 'success'} label={`${row.staff.name} paid`} />
        </div>
      ),
    },
    { key: 'remaining', header: 'Remaining', align: 'right', render: (row) => (row.remaining > 0 ? <span className="text-danger strong">{money.format(row.remaining)}</span> : <Badge tone="success">Paid</Badge>) },
    {
      key: 'payments',
      header: 'Payments',
      render: (row) =>
        row.payments.length ? (
          <div className="stack stack--sm" style={{ gap: 2 }}>
            {row.payments.map((payment) => (
              <div key={payment._id} className="row table-secondary" style={{ flexWrap: 'nowrap', gap: 4 }}>
                {formatDate(payment.paidOn, 'd MMM')} · {money.format(payment.netAmount)} · {labelOf(PAYMENT_METHODS, payment.method)}
                <IconButton icon={Ban} label="Void this payment" size="sm" variant="ghost" onClick={() => askVoid(payment, row.staff.name)} />
              </div>
            ))}
          </div>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'pay',
      header: '',
      align: 'right',
      render: (row) =>
        row.staff.status !== 'terminated' && (
          <Button size="sm" variant={row.remaining > 0 ? 'primary' : 'default'} icon={HandCoins} onClick={() => setPaying(row)}>
            Pay
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title="Salaries" subtitle="Payroll by month — every payment is recorded as a Salary expense" breadcrumbs={[{ label: 'Employees', to: '/staff' }, { label: 'Salaries' }]} />
      <div className="stack">
        <div className="toolbar card" style={{ borderBottom: 0 }}>
          <IconButton icon={ChevronLeft} label="Previous month" size="sm" variant="ghost" onClick={() => setParams({ period: shiftMonth(`${period}-01`, -1).slice(0, 7) })} />
          <input className="input" type="month" value={period} max={thisMonth} onChange={(event) => setParams({ period: event.target.value || undefined })} aria-label="Month" style={{ width: 180 }} />
          <IconButton icon={ChevronRight} label="Next month" size="sm" variant="ghost" disabled={period >= thisMonth} onClick={() => setParams({ period: shiftMonth(`${period}-01`, 1).slice(0, 7) })} />
          <strong>{formatDate(`${period}-01`, 'MMMM yyyy')}</strong>
        </div>
        <div className="grid grid--3">
          <StatCard label="Payroll for the month" icon={Banknote} value={money.format(totals?.salary ?? 0)} loading={summary.isLoading} />
          <StatCard label="Paid" icon={Wallet} tone="success" value={money.format(totals?.netPaid ?? 0)} loading={summary.isLoading} meta={totals && totals.netPaid !== totals.paid ? `${money.format(totals.paid)} salary + bonuses − deductions` : undefined} />
          <StatCard label="Still to pay" icon={HandCoins} tone="gold" value={money.format(totals?.remaining ?? 0)} danger={totals?.remaining > 0} loading={summary.isLoading} />
        </div>
        <Card>
          <DataTable
            columns={columns}
            rows={summary.data?.rows}
            rowKey={(row) => row.staff._id}
            loading={summary.isLoading}
            error={summary.error}
            onRetry={() => summary.refetch()}
            empty={<EmptyState icon={Banknote} title="No employees for this month" />}
          />
        </Card>
      </div>
      <PaySalaryDialog row={paying} period={period} onClose={() => setPaying(null)} />
    </>
  );
}
