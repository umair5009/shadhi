import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { staffApi } from '@/api/endpoints';
import { useToday } from '@/lib/hooks';
import { requiredText, optionalText, optionalPhone, cnic, money, dateText } from '@/lib/validation';
import { STAFF_POSITIONS, STAFF_STATUSES, toOptions } from '@/lib/labels';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { DateField, MoneyField, SelectField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';

const schema = z.object({
  name: requiredText('Name', 100),
  phone: optionalPhone(),
  cnic: cnic(),
  position: z.string().min(1, 'Choose a position'),
  salary: money('Monthly salary', { required: true }),
  joiningDate: dateText('Joining date'),
  status: z.string(),
  address: optionalText(300),
  notes: optionalText(1000),
});

export function EmployeeFormDialog(props) {
  return props.open ? <EmployeeFormBody {...props} /> : null;
}

function EmployeeFormBody({ onClose, employee, onSaved }) {
  const queryClient = useQueryClient();
  const today = useToday();
  const isEdit = Boolean(employee);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: employee?.name ?? '',
      phone: employee?.phone ?? '',
      cnic: employee?.cnic ?? '',
      position: employee?.position ?? 'waiter',
      salary: employee?.salary ?? '',
      joiningDate: employee ? String(employee.joiningDate).slice(0, 10) : today,
      status: employee?.status ?? 'active',
      address: employee?.address ?? '',
      notes: employee?.notes ?? '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const response = isEdit ? await staffApi.update(employee._id, values) : await staffApi.create(values);
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success(isEdit ? 'Employee updated' : `${response.data.name} added (${response.data.employeeCode})`);
      onSaved?.(response.data);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${employee.name}` : 'Add employee'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add employee'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="employee-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <TextField name="name" label="Full name" required autoFocus className="span-all" />
          <SelectField name="position" label="Position" required options={toOptions(STAFF_POSITIONS)} />
          <MoneyField name="salary" label="Monthly salary" required />
          <TextField name="phone" label="Phone" type="tel" />
          <TextField name="cnic" label="CNIC" placeholder="35202-1234567-1" />
          <DateField name="joiningDate" label="Joining date" required />
          <SelectField name="status" label="Status" options={toOptions(STAFF_STATUSES)} />
          <TextField name="address" label="Address" className="span-all" />
          <TextareaField name="notes" label="Notes" rows={2} className="span-all" />
        </form>
      </FormProvider>
    </Dialog>
  );
}
