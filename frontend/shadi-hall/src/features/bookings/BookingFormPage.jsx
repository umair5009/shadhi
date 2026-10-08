import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { bookingsApi, customersApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { useHalls } from '@/features/halls/useHalls';
import { useDebouncedValue, useMoney, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { EVENT_TYPES, BOOKING_STATUSES, PAYMENT_METHODS, toOptions } from '@/lib/labels';
import { calculateBookingTotals, getFinanceIssues } from '@shared/bookingFinance.js';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { ChipGroup, Segmented } from '@/components/ui/Controls';
import { Field } from '@/components/form/Field';
import { DateField, MoneyField, NumberField, TextField, TextareaField, TimeField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { HallChooser } from './form/HallChooser';
import { MenuSection } from './form/MenuSection';
import { usePackages } from '@/features/menu/queries';
import { ChargesSection } from './form/ChargesSection';
import { BookingSummary } from './form/BookingSummary';
import { bookingSchema, bookingToFormValues, defaultBookingValues, financeInput, formValuesToPayload, mapServerField } from './form/bookingFormModel';

/** '19:00' + 4 → '23:00' (wraps past midnight). */
const addHours = (time, hours) => {
  const [hour, minute] = time.split(':').map(Number);
  return `${String((hour + hours) % 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

function Section({ step, title, children }) {
  return (
    <section className="form-section">
      <h2 className="form-section__title">
        <span className="form-section__step">{step}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function BookingForm({ booking, prefillCustomer }) {
  const isEdit = Boolean(booking);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { organization, can } = useAuth();
  const today = useToday();
  const money = useMoney();
  const [conflict, setConflict] = useState(null);

  const form = useForm({
    resolver: zodResolver(bookingSchema),
    defaultValues: booking
      ? bookingToFormValues(booking)
      : defaultBookingValues({
          startTime: searchParams.get('start') ?? organization?.booking?.defaultStartTime,
          endTime: searchParams.get('start') ? addHours(searchParams.get('start'), 4) : organization?.booking?.defaultEndTime,
          taxRate: organization?.defaultTaxRate ?? 0,
          eventDate: searchParams.get('date') ?? '',
          hall: searchParams.get('hall') ?? '',
          customer: prefillCustomer ?? null,
        }),
  });
  const { control, setValue, getValues } = form;
  const values = useWatch({ control });

  const halls = useHalls();
  const packages = usePackages();
  const hall = halls.data?.find((entry) => entry._id === values.hall) ?? (booking && booking.hall?._id === values.hall ? booking.hall : null);
  const pkg =
    packages.data?.find((entry) => entry._id === values.packageId) ??
    (booking?.menu?.package && String(booking.menu.package.ref) === values.packageId ? { ...booking.menu.package, price: booking.menu.package.rate } : null);

  // Live totals: the same function the API uses, so what staff see is what gets saved.
  const draft = financeInput(values, pkg);
  const totals = calculateBookingTotals(draft, booking ? { paid: booking.totals.paid, refunded: booking.totals.refunded } : {});
  const issues = getFinanceIssues(draft, totals);

  const slot = useDebouncedValue({ hall: values.hall, eventDate: values.eventDate, startTime: values.startTime, endTime: values.endTime }, 300);
  const availability = useQuery({
    queryKey: ['bookings', 'availability', slot, booking?._id],
    queryFn: () => bookingsApi.checkAvailability({ ...slot, ...(booking ? { excludeBooking: booking._id } : {}) }),
    enabled: Boolean(slot.hall && slot.eventDate && slot.startTime && slot.endTime),
  });

  const chooseHall = (next) => {
    const previous = halls.data?.find((entry) => entry._id === getValues('hall'));
    setValue('hall', next._id, { shouldValidate: true, shouldDirty: true });
    const currentCharge = getValues('charges.hall');
    if (currentCharge === '' || currentCharge === previous?.basePrice) setValue('charges.hall', next.basePrice, { shouldDirty: true });
  };

  const statusOptions = BOOKING_STATUSES.filter((status) => {
    if (status.value === 'cancelled') return false;
    if (status.value === 'confirmed') return can('bookings.status');
    if (status.value === 'completed') return can('bookings.status') && values.eventDate && values.eventDate <= today;
    return true;
  });

  const onSubmit = form.handleSubmit(async (formValues) => {
    setConflict(null);
    try {
      const payload = formValuesToPayload(formValues, { isEdit });
      const response = isEdit ? await bookingsApi.update(booking._id, payload) : await bookingsApi.create(payload);
      await Promise.all([...MONEY_QUERY_KEYS, ['halls']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(isEdit ? 'Booking updated' : `Booking ${response.data.bookingNumber} saved`);
      for (const warning of response.meta?.warnings ?? []) toast.warning(warning);
      navigate(`/bookings/${response.data._id}`);
    } catch (error) {
      if (error.code === 'BOOKING_CONFLICT') {
        setConflict(error);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const details = Array.isArray(error.details) ? error.details.map((detail) => ({ ...detail, field: detail.field && mapServerField(detail.field) })) : error.details;
      applyServerErrors({ ...error, message: error.message, details }, form.setError);
    }
  });

  return (
    <FormProvider {...form}>
      <PageHeader
        title={isEdit ? `Edit ${booking.bookingNumber}` : 'New booking'}
        subtitle={isEdit ? `${booking.customer.fullName}` : 'Customer, date and hall are all you need to hold a date — the rest can be added later.'}
        breadcrumbs={[{ label: 'Bookings', to: '/bookings' }, ...(isEdit ? [{ label: booking.bookingNumber, to: `/bookings/${booking._id}` }] : []), { label: isEdit ? 'Edit' : 'New' }]}
      />
      {conflict && (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="danger" title="This hall is already booked at that time">
            {conflict.message.replace(/^This hall is already booked at that time: /, '')}. Choose another hall or time, or save it as tentative.
          </Alert>
        </div>
      )}
      <form id="booking-form" className="has-savebar" onSubmit={onSubmit} noValidate>
        <div className="split split--wide-side">
          <Card>
            <Section step={1} title="Customer">
              <Controller
                control={control}
                name="customer"
                render={({ field, fieldState }) => (
                  <Field error={fieldState.error?.message}>
                    {({ id, invalid }) => <CustomerPicker id={id} value={field.value} onChange={field.onChange} invalid={invalid} />}
                  </Field>
                )}
              />
            </Section>

            <Section step={2} title="Event">
              <div className="stack">
                <Controller
                  control={control}
                  name="eventType"
                  render={({ field }) => (
                    <Field label="Event type" required>
                      {() => <ChipGroup label="Event type" options={toOptions(EVENT_TYPES)} value={field.value} onChange={field.onChange} />}
                    </Field>
                  )}
                />
                <div className="form-grid form-grid--3">
                  <DateField name="eventDate" label="Event date" required />
                  <TimeField name="startTime" label="Starts at" required />
                  <TimeField name="endTime" label="Ends at" required hint={values.endTime && values.startTime && values.endTime <= values.startTime ? 'Ends after midnight (next day)' : undefined} />
                  <NumberField name="guestCount" label="Number of guests" required min="1" />
                  <TextField name="title" label="Title (optional)" placeholder="e.g. Ahmed weds Sana" className="span-2" />
                </div>
              </div>
            </Section>

            <Section step={3} title="Hall">
              <HallChooser
                value={values.hall}
                onChange={chooseHall}
                date={values.eventDate}
                startTime={values.startTime}
                endTime={values.endTime}
                excludeBooking={booking?._id}
                guestCount={values.guestCount}
              />
              {form.formState.errors.hall && <span className="field__error">{form.formState.errors.hall.message}</span>}
            </Section>

            <Section step={4} title="Food & menu">
              <MenuSection guestCount={values.guestCount} />
            </Section>

            <Section step={5} title="Charges & services">
              <ChargesSection hall={hall} />
            </Section>

            <Section step={6} title={isEdit ? 'Notes' : 'Status, advance & notes'}>
              <div className="stack">
                {!isEdit && (
                  <Controller
                    control={control}
                    name="status"
                    render={({ field }) => (
                      <Field label="Booking status" hint={BOOKING_STATUSES.find((status) => status.value === field.value)?.description}>
                        {() => <Segmented label="Booking status" options={statusOptions} value={field.value} onChange={field.onChange} />}
                      </Field>
                    )}
                  />
                )}
                {!isEdit && can('payments.create') && (
                  <div className="advance-box">
                    <div className="form-grid">
                      <MoneyField name="advance.amount" label="Advance received now" hint="Leave empty if no money was taken yet" />
                      {Number(values.advance?.amount) > 0 && <TextField name="advance.reference" label="Reference (optional)" />}
                    </div>
                    {Number(values.advance?.amount) > 0 && (
                      <Controller
                        control={control}
                        name="advance.method"
                        render={({ field }) => (
                          <Field label="Paid by">{() => <ChipGroup label="Advance method" options={toOptions(PAYMENT_METHODS)} value={field.value} onChange={field.onChange} />}</Field>
                        )}
                      />
                    )}
                  </div>
                )}
                <TextareaField name="notes" label="Notes" rows={3} placeholder="Anything the team should know: seating, timings, special requests…" />
              </div>
            </Section>
          </Card>

          <aside className="sticky-side">
            <BookingSummary
              values={values}
              totals={totals}
              issues={issues}
              hall={hall}
              pkg={pkg}
              availability={availability}
              isEdit={isEdit}
              paid={booking?.totals.netPaid ?? 0}
              submitting={form.formState.isSubmitting}
              onCancel={() => navigate(isEdit ? `/bookings/${booking._id}` : '/bookings')}
            />
          </aside>
        </div>
      </form>
      {/* On narrow screens the summary sits below the long form, so the total and Save stay pinned to the bottom. */}
      <div className="mobile-savebar">
        <div className="mobile-savebar__total">
          <span>Grand total</span>
          <strong>{money.format(totals.grandTotal)}</strong>
        </div>
        <Button type="submit" form="booking-form" variant="primary" size="lg" loading={form.formState.isSubmitting}>
          {isEdit ? 'Save changes' : 'Save booking'}
        </Button>
      </div>
    </FormProvider>
  );
}

export function BookingFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const customerId = !id ? searchParams.get('customer') : null;
  const existing = useQuery({ queryKey: ['bookings', id], queryFn: () => bookingsApi.get(id), enabled: Boolean(id) });
  // "New booking" from a customer's page arrives with ?customer=<id>.
  const prefill = useQuery({ queryKey: ['customers', customerId], queryFn: () => customersApi.get(customerId), enabled: Boolean(customerId) });
  if ((id && existing.isLoading) || prefill.isLoading) return <PageLoader />;
  if (id && existing.isError) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (existing.data?.status === 'cancelled') {
    return <Alert tone="warning" title="Cancelled bookings can’t be edited">Reinstate the booking from its page first.</Alert>;
  }
  return <BookingForm key={id ?? 'new'} booking={id ? existing.data : null} prefillCustomer={prefill.data} />;
}
