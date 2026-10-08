const { labelOf, lineTotal, EVENT_TYPES } = require('../../config/shared');

/**
 * The priced lines printed on an invoice, derived from the booking's stored charges.
 * Their amounts add up to the booking subtotal.
 */
function buildInvoiceLines(booking) {
  const lines = [];
  const { charges, menu, services, guestCount } = booking;

  if (charges.hall > 0) {
    lines.push({ description: `Hall booking — ${booking.hall?.name ?? 'Hall'}`, quantity: 1, rate: charges.hall, amount: charges.hall });
  }

  if (menu?.mode === 'package' && menu.package) {
    const perPerson = menu.package.pricingType !== 'fixed';
    const included = menu.items.filter((line) => line.source === 'package').map((line) => line.name);
    lines.push({
      description: `${menu.package.name} menu${perPerson ? ' (per person)' : ''}`,
      detail: included.length ? `Includes: ${included.join(', ')}` : undefined,
      quantity: perPerson ? guestCount : 1,
      rate: menu.package.rate,
      amount: lineTotal(perPerson ? guestCount : 1, menu.package.rate),
    });
  }
  for (const line of menu?.items ?? []) {
    if (line.source === 'package') continue;
    lines.push({
      description: line.source === 'extra' ? `Extra: ${line.name}` : line.name,
      detail: line.category,
      quantity: line.quantity,
      rate: line.unitPrice,
      amount: line.total,
    });
  }

  for (const service of services ?? []) {
    lines.push({ description: service.name, detail: service.description, quantity: service.quantity, rate: service.unitPrice, amount: service.total });
  }
  if (charges.decoration > 0) lines.push({ description: 'Decoration', quantity: 1, rate: charges.decoration, amount: charges.decoration });
  if (charges.other > 0) lines.push({ description: 'Other charges', quantity: 1, rate: charges.other, amount: charges.other });
  return lines;
}

/** Frozen copy of everything printed on the invoice. `booking` must have customer and hall populated. */
function buildInvoiceSnapshot(business, booking) {
  return {
    business: {
      name: business.name,
      tagline: business.tagline,
      address: business.address,
      city: business.city,
      phone: business.phone,
      email: business.email,
      website: business.website,
      tax: business.tax,
      logo: business.logo,
    },
    customer: {
      _id: booking.customer._id,
      fullName: booking.customer.fullName,
      phone: booking.customer.phone,
      alternatePhone: booking.customer.alternatePhone,
      email: booking.customer.email,
      address: booking.customer.address,
      city: booking.customer.city,
      cnic: booking.customer.cnic,
    },
    event: {
      bookingNumber: booking.bookingNumber,
      eventType: booking.eventType,
      eventTypeLabel: labelOf(EVENT_TYPES, booking.eventType),
      title: booking.title,
      eventDate: booking.eventDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      hall: booking.hall.name,
      guestCount: booking.guestCount,
    },
    menu: booking.menu,
    services: booking.services,
    lines: buildInvoiceLines(booking),
    charges: booking.charges,
    totals: booking.totals,
    currency: business.currency,
    terms: business.invoice?.terms,
    footer: business.invoice?.footer,
  };
}

/** Values that, if changed on the booking, make an issued invoice out of date. */
function invoiceFingerprint(snapshotOrBooking) {
  const event = snapshotOrBooking.event ?? snapshotOrBooking;
  return JSON.stringify([
    snapshotOrBooking.totals?.grandTotal,
    new Date(event.eventDate).toISOString().slice(0, 10),
    event.startTime,
    event.endTime,
    event.guestCount,
    typeof event.hall === 'string' ? event.hall : event.hall?.name,
  ]);
}

module.exports = { buildInvoiceLines, buildInvoiceSnapshot, invoiceFingerprint };
