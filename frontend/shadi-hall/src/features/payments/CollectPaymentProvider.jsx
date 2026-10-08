import { createContext, useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleCheck, Printer } from 'lucide-react';
import { bookingsApi, paymentsApi } from '@/api/endpoints';
import { fileUrl } from '@/api/client';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Alert, PageLoader } from '@/components/ui/Feedback';
import { ChipGroup } from '@/components/ui/Controls';
import { Field, Select } from '@/components/form/Field';
import { DateField, MoneyField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { BookingPicker } from '@/features/bookings/BookingPicker';
import { useMoney, useToday } from '@/lib/hooks';
import { MONEY_QUERY_KEYS } from '@/lib/queryKeys';
import { useAuth } from '@/features/auth/AuthProvider';
import { money, dateText, optionalText, requiredText } from '@/lib/validation';
import { PAYMENT_METHODS, PAYMENT_TYPES, labelOf, toOptions } from '@/lib/labels';
import { suggestPaymentType } from '@shared/bookingFinance.js';

const CollectPaymentContext = createContext(null);

const receiveSchema = z.object({
  amount: money('Amount', { required: true, positive: true }),
  method: z.string().min(1),
  type: z.string(),
  paidOn: dateText('Payment date'),
  reference: optionalText(100),
  notes: optionalText(1000),
});

const refundSchema = receiveSchema.extend({ notes: requiredText('Reason for the refund', 1000) });

function BookingMoney({ booking }) {
  const money = useMoney();
  const { totals } = booking;
  return (
    <div className="card" style={{ padding: 16, background: 'var(--surface-muted)', boxShadow: 'none' }}>
      <div className="money-summary">
        <div className="money-summary__row">
          <span>Booking total</span>
          <span className="strong">{money.format(totals.grandTotal)}</span>
        </div>
        <div className="money-summary__row">
          <span>Paid so far</span>
          <span className="text-success strong">{money.format(totals.netPaid)}</span>
        </div>
        <div className={`money-summary__row money-summary__row--balance${totals.balance <= 0 ? ' money-summary__row--settled' : ''}`}>
          <span>Remaining</span>
          <span>{money.format(Math.max(0, totals.balance))}</span>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ booking, mode, onDone }) {
  const money = useMoney();
  const { organization } = useAuth();
  const today = useToday();
  const isRefund = mode === 'refund';
  const balance = Math.max(0, booking.totals.balance);
  const form = useForm({
    resolver: zodResolver(isRefund ? refundSchema : receiveSchema),
    defaultValues: {
      amount: isRefund ? '' : balance || '',
      method: 'cash',
      // '' = automatic: advance / installment / final is worked out from the amount.
      type: isRefund ? 'refund' : '',
      paidOn: today,
      reference: '',
      notes: '',
    },
  });
  const amount = useWatch({ control: form.control, name: 'amount' });
  const method = useWatch({ control: form.control, name: 'method' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const body = { booking: booking._id, amount: values.amount, method: values.method, paidOn: values.paidOn, reference: values.reference, notes: values.notes };
      const payment = isRefund ? await paymentsApi.refund(body) : await paymentsApi.receive({ ...body, type: values.type || suggestPaymentType(booking.totals, values.amount) });
      onDone(payment);
    } catch (error) {
      applyServerErrors(error, form.setError, ['amount', 'method', 'paidOn', 'reference', 'notes']);
    }
  });

  const overBalance = !isRefund && !organization?.allowOverpayment && typeof amount === 'number' && amount > balance + 0.005;

  return (
    <FormProvider {...form}>
      <form id="payment-form" className="stack" onSubmit={onSubmit} noValidate>
        <BookingMoney booking={booking} />
        {booking.status === 'cancelled' && !isRefund && <Alert tone="warning">This booking is cancelled. Only refunds can be recorded.</Alert>}
        <MoneyField name="amount" label={isRefund ? 'Refund amount' : 'Amount received'} required autoFocus />
        {!isRefund && balance > 0 && (
          <div className="row" style={{ marginTop: -8 }}>
            <Button size="sm" variant="subtle" onClick={() => form.setValue('amount', balance, { shouldValidate: true })}>
              Full balance · {money.format(balance)}
            </Button>
            {balance >= 2000 && (
              <Button size="sm" variant="ghost" onClick={() => form.setValue('amount', Math.round(balance / 2), { shouldValidate: true })}>
                Half
              </Button>
            )}
          </div>
        )}
        {overBalance && <Alert tone="warning">This is more than the remaining balance.</Alert>}
        <Field label="Payment method" required>
          {() => (
            <Controller
              control={form.control}
              name="method"
              render={({ field }) => <ChipGroup label="Payment method" options={toOptions(PAYMENT_METHODS)} value={field.value} onChange={field.onChange} />}
            />
          )}
        </Field>
        <div className="form-grid">
          <DateField name="paidOn" label={isRefund ? 'Refund date' : 'Payment date'} required max={today} />
          {!isRefund ? (
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Field label="Payment type" hint="Worked out from the amount — change only if needed">
                  {({ id }) => (
                    <Select
                      id={id}
                      placeholder={`Automatic · ${labelOf(PAYMENT_TYPES, suggestPaymentType(booking.totals, typeof amount === 'number' ? amount : 0))}`}
                      options={toOptions(PAYMENT_TYPES.filter((type) => type.value !== 'refund'))}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                </Field>
              )}
            />
          ) : (
            <div />
          )}
        </div>
        {method !== 'cash' && <TextField name="reference" label="Reference / transaction ID" placeholder="e.g. bank or JazzCash transaction number" />}
        <TextareaField name="notes" label={isRefund ? 'Reason for refund' : 'Notes'} required={isRefund} rows={2} />
      </form>
    </FormProvider>
  );
}

function SuccessView({ payment, onClose }) {
  const money = useMoney();
  const isRefund = payment.type === 'refund';
  const remaining = Math.max(0, payment.booking?.totals?.balance ?? 0);
  return (
    <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '8px 0' }}>
      <div className="empty-state__icon" style={{ background: 'var(--success-100)', color: 'var(--success-700)' }}>
        <CircleCheck size={26} aria-hidden />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{money.format(payment.amount)}</div>
        <div className="secondary">
          {isRefund ? 'refunded to' : 'received from'} <strong>{payment.customer?.fullName}</strong> · {labelOf(PAYMENT_METHODS, payment.method)}
        </div>
        <div className="muted" style={{ marginTop: 4 }}>
          Receipt {payment.receiptNumber} · Booking {payment.booking?.bookingNumber}
        </div>
      </div>
      <Alert tone={remaining > 0 ? 'warning' : 'success'}>{remaining > 0 ? `Still to collect: ${money.format(remaining)}` : 'This booking is now fully paid.'}</Alert>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button icon={Printer} onClick={() => window.open(fileUrl(`/payments/${payment._id}/receipt.pdf`), '_blank', 'noopener')}>
          Print receipt
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function CollectPaymentDialog({ request, onClose }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState(null);
  const [payment, setPayment] = useState(null);
  const mode = request?.mode ?? 'receive';
  const preset = useQuery({
    queryKey: ['bookings', request?.bookingId],
    queryFn: () => bookingsApi.get(request.bookingId),
    enabled: Boolean(request?.bookingId),
  });
  const booking = picked ?? (request?.bookingId ? preset.data : null);

  const close = () => {
    setPicked(null);
    setPayment(null);
    onClose();
  };

  const done = async (result) => {
    setPayment(result);
    await Promise.all(MONEY_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };

  const title = mode === 'refund' ? 'Record a refund' : 'Collect payment';
  return (
    <Dialog
      open={Boolean(request)}
      onClose={close}
      title={payment ? (mode === 'refund' ? 'Refund recorded' : 'Payment received') : title}
      description={payment ? undefined : booking ? `${booking.customer?.fullName} · ${booking.bookingNumber}` : 'Find the booking the money is for'}
      footer={
        !payment &&
        booking && (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="payment-form" variant={mode === 'refund' ? 'danger' : 'primary'}>
              {mode === 'refund' ? 'Record refund' : 'Save payment'}
            </Button>
          </>
        )
      }
    >
      {payment ? (
        <SuccessView payment={payment} onClose={close} />
      ) : request?.bookingId && preset.isLoading ? (
        <PageLoader />
      ) : booking ? (
        <div className="stack">
          {!request?.bookingId && <BookingPicker value={booking} onChange={setPicked} />}
          <PaymentForm key={booking._id} booking={booking} mode={mode} onDone={done} />
        </div>
      ) : (
        <div className="stack">
          <BookingPicker value={null} onChange={setPicked} filters={mode === 'refund' ? {} : { hasBalance: true, sort: 'eventDate' }} />
          <p className="field__hint">Only bookings that still have money to collect are listed.</p>
        </div>
      )}
    </Dialog>
  );
}

/** Makes the payment dialog available anywhere: `const collect = useCollectPayment(); collect({ bookingId })`. */
export function CollectPaymentProvider({ children }) {
  const [request, setRequest] = useState(null);
  const open = (options = {}) => setRequest({ mode: 'receive', ...options });
  return (
    <CollectPaymentContext.Provider value={open}>
      {children}
      <CollectPaymentDialog request={request} onClose={() => setRequest(null)} />
    </CollectPaymentContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCollectPayment() {
  const open = useContext(CollectPaymentContext);
  if (!open) throw new Error('useCollectPayment must be used inside <CollectPaymentProvider>');
  return open;
}
