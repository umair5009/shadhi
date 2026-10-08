import { z } from 'zod';
import { dateText, timeText, money, optionalText, toNumber } from '@/lib/validation';

// Form ⇄ API mapping for the booking form, plus the input for the live finance summary.

export const bookingSchema = z
  .object({
    customer: z.any().refine((value) => Boolean(value?._id), 'Choose or add a customer'),
    eventType: z.string().min(1, 'Choose the event type'),
    title: optionalText(160),
    eventDate: dateText('Event date'),
    startTime: timeText('Start time'),
    endTime: timeText('End time'),
    guestCount: z.number({ invalid_type_error: 'Enter the number of guests' }).int('Whole number of guests').min(1, 'At least 1 guest').max(100000),
    hall: z.string().min(1, 'Choose a hall'),
    menuMode: z.enum(['package', 'custom', 'none']),
    packageId: z.string().optional(),
    packageRate: money('Package price'),
    extras: z.array(z.object({ menuItem: z.string(), name: z.string(), unit: z.string().optional(), quantity: z.number().min(0), unitPrice: z.number().min(0) })),
    customItems: z.array(z.object({ menuItem: z.string(), name: z.string(), unit: z.string().optional(), quantity: z.number().min(0), unitPrice: z.number().min(0) })),
    menuNotes: optionalText(1000),
    services: z.array(z.object({ name: z.string().trim().min(1, 'Name the service'), quantity: z.number().min(0), unitPrice: z.number().min(0) })),
    charges: z.object({
      hall: money('Hall charges'),
      decoration: money('Decoration'),
      other: money('Other charges'),
      discount: money('Discount'),
      taxRate: z.union([z.number().min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100%'), z.literal('')]),
    }),
    status: z.enum(['inquiry', 'tentative', 'confirmed', 'completed']),
    notes: optionalText(3000),
    advance: z.object({ amount: money('Advance'), method: z.string(), reference: optionalText(100) }),
  })
  .superRefine((values, issue) => {
    if (values.menuMode === 'package' && !values.packageId) issue.addIssue({ code: 'custom', path: ['packageId'], message: 'Choose a package' });
    if (values.menuMode === 'custom' && values.customItems.length === 0) issue.addIssue({ code: 'custom', path: ['customItems'], message: 'Add at least one dish' });
  });

export function defaultBookingValues({ startTime = '19:00', endTime = '23:00', taxRate = 0, customer = null, eventDate = '', hall = '' } = {}) {
  return {
    customer,
    eventType: 'wedding',
    title: '',
    eventDate,
    startTime,
    endTime,
    guestCount: 300,
    hall,
    menuMode: 'package',
    packageId: '',
    packageRate: '',
    extras: [],
    customItems: [],
    menuNotes: '',
    services: [],
    charges: { hall: '', decoration: '', other: '', discount: '', taxRate },
    status: 'tentative',
    notes: '',
    advance: { amount: '', method: 'cash', reference: '' },
  };
}

const toLine = (item) => ({ menuItem: String(item.menuItem ?? ''), name: item.name, unit: item.unit, quantity: item.quantity ?? 0, unitPrice: item.unitPrice ?? 0 });

/** Existing booking → form values (edit mode). */
export function bookingToFormValues(booking) {
  const menu = booking.menu ?? { mode: 'none', items: [] };
  return {
    ...defaultBookingValues(),
    customer: booking.customer,
    eventType: booking.eventType,
    title: booking.title ?? '',
    eventDate: String(booking.eventDate).slice(0, 10),
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestCount: booking.guestCount,
    hall: booking.hall?._id ?? booking.hall,
    menuMode: menu.mode,
    packageId: menu.package?.ref ? String(menu.package.ref) : '',
    packageRate: menu.package?.rate ?? '',
    extras: menu.items.filter((item) => item.source === 'extra').map(toLine),
    customItems: menu.items.filter((item) => item.source === 'custom').map(toLine),
    menuNotes: menu.notes ?? '',
    services: (booking.services ?? []).map((service) => ({ name: service.name, quantity: service.quantity, unitPrice: service.unitPrice })),
    charges: {
      hall: booking.charges.hall,
      decoration: booking.charges.decoration,
      other: booking.charges.other,
      discount: booking.charges.discount,
      taxRate: booking.charges.taxRate,
    },
    status: booking.status,
    notes: booking.notes ?? '',
  };
}

function menuPayload(values) {
  if (values.menuMode === 'none') return { mode: 'none', notes: values.menuNotes };
  const line = ({ menuItem, quantity, unitPrice }) => ({ menuItem, quantity, unitPrice });
  if (values.menuMode === 'package') {
    return {
      mode: 'package',
      package: values.packageId,
      ...(values.packageRate !== '' ? { rate: values.packageRate } : {}),
      extras: values.extras.map(line),
      notes: values.menuNotes,
    };
  }
  return { mode: 'custom', items: values.customItems.map(line), notes: values.menuNotes };
}

/** Form values → API body. */
export function formValuesToPayload(values, { isEdit }) {
  const body = {
    customer: values.customer._id,
    hall: values.hall,
    eventType: values.eventType,
    title: values.title,
    eventDate: values.eventDate,
    startTime: values.startTime,
    endTime: values.endTime,
    guestCount: values.guestCount,
    menu: menuPayload(values),
    services: values.services,
    charges: {
      hall: toNumber(values.charges.hall),
      decoration: toNumber(values.charges.decoration),
      other: toNumber(values.charges.other),
      discount: toNumber(values.charges.discount),
      taxRate: toNumber(values.charges.taxRate),
    },
    notes: values.notes,
  };
  if (!isEdit) {
    body.status = values.status;
    if (toNumber(values.advance.amount) > 0) {
      body.advancePayment = { amount: toNumber(values.advance.amount), method: values.advance.method, reference: values.advance.reference };
    }
  }
  return body;
}

/** Shape expected by shared/bookingFinance.calculateBookingTotals. */
export function financeInput(values, selectedPackage) {
  const mode = values.menuMode;
  const lines = mode === 'package' ? values.extras.map((line) => ({ ...line, source: 'extra' })) : mode === 'custom' ? values.customItems.map((line) => ({ ...line, source: 'custom' })) : [];
  return {
    guestCount: toNumber(values.guestCount),
    menu: {
      mode,
      package: mode === 'package' && selectedPackage ? { pricingType: selectedPackage.pricingType, rate: values.packageRate === '' ? selectedPackage.price : values.packageRate } : null,
      items: lines,
    },
    services: values.services,
    charges: {
      hall: toNumber(values.charges.hall),
      decoration: toNumber(values.charges.decoration),
      other: toNumber(values.charges.other),
      discount: toNumber(values.charges.discount),
      taxRate: toNumber(values.charges.taxRate),
    },
  };
}

/** API field paths → form field names, for server validation errors. */
export function mapServerField(field) {
  if (field === 'menu.package') return 'packageId';
  if (field.startsWith('menu.items')) return 'customItems';
  if (field.startsWith('menu.extras')) return 'extras';
  if (field.startsWith('advancePayment')) return field.replace('advancePayment', 'advance');
  return field;
}
