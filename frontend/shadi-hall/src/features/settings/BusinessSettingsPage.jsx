import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Gem, ImagePlus, Trash2 } from 'lucide-react';
import { settingsApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { requiredText, optionalText, optionalPhone, optionalEmail } from '@/lib/validation';
import { formatMoney } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageLoader, ErrorState } from '@/components/ui/Feedback';
import { NumberField, SelectField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';

const schema = z.object({
  name: requiredText('Business name', 120),
  tagline: optionalText(160),
  address: optionalText(300),
  city: optionalText(80),
  phone: optionalPhone(),
  email: optionalEmail(),
  website: optionalText(200),
  tax: z.object({
    ntn: optionalText(40),
    strn: optionalText(40),
    label: optionalText(40),
    defaultRate: z.number({ invalid_type_error: 'Enter a number' }).min(0).max(100),
  }),
  currency: z.object({
    code: z.string().trim().regex(/^[A-Za-z]{3}$/, '3-letter code, e.g. PKR'),
    symbol: requiredText('Symbol', 8),
    locale: requiredText('Number format', 20),
    decimals: z.coerce.number().int().min(0).max(2),
  }),
  invoice: z.object({
    prefix: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/, 'Up to 10 letters or numbers'),
    receiptPrefix: z.string().trim().regex(/^[A-Za-z0-9]{1,10}$/, 'Up to 10 letters or numbers'),
    startingNumber: z.number({ invalid_type_error: 'Enter a number' }).int().min(1),
    dueDays: z.number({ invalid_type_error: 'Enter a number' }).int().min(0).max(365),
    footer: optionalText(500),
    terms: optionalText(3000),
  }),
});

const LOCALES = [
  { value: 'en-PK', label: '1,250,000 (Pakistan)' },
  { value: 'en-IN', label: '12,50,000 (lakh grouping)' },
  { value: 'en-US', label: '1,250,000 (international)' },
  { value: 'de-DE', label: '1.250.000 (European)' },
];

function LogoCard({ settings, canEdit }) {
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await refreshProfile();
      toast.success(message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Logo" subtitle="Shown in the sidebar and on invoices and receipts" />
      <CardBody>
        <div className="row" style={{ gap: 16 }}>
          <div className="invoice-doc__logo" style={{ width: 88, height: 88 }}>
            {settings.logo?.url ? <img src={settings.logo.url} alt="Business logo" /> : <Gem size={30} aria-hidden />}
          </div>
          {canEdit && (
            <div className="stack stack--sm">
              <label className="btn" style={{ width: 'fit-content' }}>
                <ImagePlus size={16} aria-hidden /> {busy ? 'Uploading…' : settings.logo ? 'Change logo' : 'Upload logo'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(event) => event.target.files?.[0] && run(() => settingsApi.uploadLogo(event.target.files[0]), 'Logo updated')} />
              </label>
              {settings.logo && (
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => run(settingsApi.removeLogo, 'Logo removed')}>
                  Remove
                </Button>
              )}
              <span className="field__hint">PNG or JPG works best on PDFs. Square, at least 256 px.</span>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export function BusinessSettingsPage() {
  const { can, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = can('settings.update');
  const settings = useQuery({ queryKey: ['settings', 'business'], queryFn: settingsApi.business });
  const form = useForm({ resolver: zodResolver(schema) });
  const currency = useWatch({ control: form.control, name: 'currency' });

  useEffect(() => {
    if (!settings.data) return;
    const data = settings.data;
    form.reset({
      name: data.name,
      tagline: data.tagline ?? '',
      address: data.address ?? '',
      city: data.city ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      website: data.website ?? '',
      tax: { ntn: data.tax?.ntn ?? '', strn: data.tax?.strn ?? '', label: data.tax?.label ?? 'Sales Tax', defaultRate: data.tax?.defaultRate ?? 0 },
      currency: { code: data.currency.code, symbol: data.currency.symbol, locale: data.currency.locale, decimals: data.currency.decimals },
      invoice: { ...data.invoice, footer: data.invoice.footer ?? '', terms: data.invoice.terms ?? '' },
    });
  }, [settings.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await settingsApi.updateBusiness(values);
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await refreshProfile();
      toast.success('Business settings saved');
    } catch (error) {
      applyServerErrors(error, form.setError);
    }
  });

  if (settings.isLoading) return <PageLoader />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  return (
    <>
      <PageHeader
        title="Business settings"
        subtitle="Your details as they appear on invoices and receipts"
        actions={
          canEdit && (
            <Button type="submit" form="business-form" variant="primary" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
              Save changes
            </Button>
          )
        }
      />
      <FormProvider {...form}>
        <form id="business-form" onSubmit={onSubmit} noValidate>
          <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="split">
              <div className="stack">
                <Card>
                  <CardHeader title="Business profile" />
                  <CardBody>
                    <div className="form-grid">
                      <TextField name="name" label="Business name" required className="span-all" />
                      <TextField name="tagline" label="Tagline" placeholder="Weddings · Banquets · Marquees" className="span-all" />
                      <TextField name="address" label="Address" className="span-all" />
                      <TextField name="city" label="City" />
                      <TextField name="phone" label="Phone" type="tel" />
                      <TextField name="email" label="Email" type="email" />
                      <TextField name="website" label="Website" />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Invoices & receipts" subtitle="Numbers look like INV-2026-00001 and restart each year" />
                  <CardBody>
                    <div className="form-grid">
                      <TextField name="invoice.prefix" label="Invoice prefix" />
                      <TextField name="invoice.receiptPrefix" label="Receipt prefix" />
                      <NumberField name="invoice.startingNumber" label="Starting invoice number" hint="Use when moving from a paper book" min="1" />
                      <NumberField name="invoice.dueDays" label="Payment due after (days)" min="0" />
                      <TextareaField name="invoice.terms" label="Terms & conditions" rows={5} className="span-all" />
                      <TextField name="invoice.footer" label="Footer message" className="span-all" />
                    </div>
                  </CardBody>
                </Card>
              </div>
              <div className="stack">
                <LogoCard settings={settings.data} canEdit={canEdit} />
                <Card>
                  <CardHeader title="Tax" />
                  <CardBody>
                    <div className="form-grid">
                      <TextField name="tax.ntn" label="NTN" />
                      <TextField name="tax.strn" label="STRN" />
                      <TextField name="tax.label" label="Tax name" placeholder="PST / GST" />
                      <NumberField name="tax.defaultRate" label="Default tax %" min="0" max="100" step="0.5" hint="Pre-filled on new bookings" />
                    </div>
                  </CardBody>
                </Card>
                <Card>
                  <CardHeader title="Currency" subtitle={`Preview: ${formatMoney(1250000, currency ?? settings.data.currency)}`} />
                  <CardBody>
                    <div className="form-grid">
                      <TextField name="currency.code" label="Code" />
                      <TextField name="currency.symbol" label="Symbol" />
                      <SelectField name="currency.locale" label="Number format" options={LOCALES} className="span-all" />
                      <SelectField
                        name="currency.decimals"
                        label="Decimals"
                        options={[
                          { value: '0', label: 'None (Rs. 1,250)' },
                          { value: '2', label: 'Two (Rs. 1,250.00)' },
                        ]}
                        className="span-all"
                      />
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
