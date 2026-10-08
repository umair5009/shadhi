import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { settingsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader, ErrorState } from '@/components/ui/Feedback';
import { NumberField, SelectField, SwitchField, TimeField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';

const TIMEZONES = ['Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Dhaka', 'Europe/London', 'America/New_York', 'UTC'].map((zone) => ({ value: zone, label: zone.replace('_', ' ') }));
const DATE_FORMATS = ['dd MMM yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'].map((value) => ({ value, label: value }));

export function SystemSettingsPage() {
  const { can, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can('settings.update');
  const settings = useQuery({ queryKey: ['settings', 'system'], queryFn: settingsApi.system });
  const form = useForm();

  useEffect(() => {
    if (!settings.data) return;
    const { timezone, dateFormat, booking, payments } = settings.data;
    form.reset({ timezone, dateFormat, booking, payments });
  }, [settings.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await settingsApi.updateSystem({ ...values, booking: { ...values.booking, bufferMinutes: Number(values.booking.bufferMinutes) } });
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await refreshProfile();
      toast.success('System settings saved');
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  if (settings.isLoading) return <PageLoader />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  return (
    <>
      <PageHeader
        title="System settings"
        subtitle="How bookings and payments behave"
        actions={
          canEdit && (
            <Button type="submit" form="system-form" variant="primary" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
              Save changes
            </Button>
          )
        }
      />
      <FormProvider {...form}>
        <form id="system-form" onSubmit={onSubmit} noValidate>
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="grid grid--2" style={{ alignItems: 'start' }}>
              <Card>
                <CardHeader title="Bookings" />
                <CardBody>
                  <div className="stack">
                    <div className="form-grid">
                      <TimeField name="booking.defaultStartTime" label="Default start time" />
                      <TimeField name="booking.defaultEndTime" label="Default end time" />
                      <NumberField name="booking.bufferMinutes" label="Gap between events (minutes)" hint="Setup and cleaning time kept free between two events in the same hall" min="0" max="480" className="span-all" />
                    </div>
                    <SwitchField name="booking.autoCompleteEvents" label="Mark events as completed automatically" hint="Confirmed events become ‘Completed’ once their end time has passed" />
                  </div>
                </CardBody>
              </Card>
              <div className="stack">
                <Card>
                  <CardHeader title="Payments" />
                  <CardBody>
                    <SwitchField name="payments.allowOverpayment" label="Allow payments above the booking total" hint="Off: the system refuses any payment larger than the remaining balance" />
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Region" />
                  <CardBody>
                    <div className="form-grid">
                      <SelectField name="timezone" label="Timezone" options={TIMEZONES} hint="Decides what ‘today’ means for events and reports" />
                      <SelectField name="dateFormat" label="Date format" options={DATE_FORMATS} />
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>
          </fieldset>
        </form>
      </FormProvider>
    </>
  );
}
