// The single source of truth for booking money.
// The API stores what this returns; the booking form shows what this returns while the user types.
//
//   Hall + Menu + Decoration + Services + Other = Subtotal
//   Subtotal − Discount                          = Taxable amount
//   Taxable amount × Tax rate                    = Tax
//   Taxable amount + Tax                         = Grand total
//   Payments − Refunds                           = Net paid
//   Grand total − Net paid                       = Balance

// Amounts within this tolerance are treated as equal (guards float noise on 2-decimal money).
export const MONEY_EPSILON = 0.005;

export function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function lineTotal(quantity, unitPrice) {
  return roundMoney(amount(quantity) * amount(unitPrice));
}

function sumLines(lines) {
  return roundMoney((lines ?? []).reduce((total, line) => total + lineTotal(line.quantity, line.unitPrice), 0));
}

/**
 * Menu charges for a booking.
 * - package / per_person : rate × guests + extras
 * - package / fixed      : rate + extras
 * - custom               : Σ custom lines
 * - none                 : 0
 * Lines with source 'package' are the package's included dishes and carry no price of their own.
 */
export function calculateMenuCharges(menu, guestCount) {
  if (!menu || menu.mode === 'none' || !menu.mode) return 0;
  const pricedLines = (menu.items ?? []).filter((line) => line.source !== 'package');
  const linesTotal = sumLines(pricedLines);

  if (menu.mode === 'package') {
    const rate = amount(menu.package?.rate);
    const base = menu.package?.pricingType === 'fixed' ? rate : rate * Math.max(0, amount(guestCount));
    return roundMoney(base + linesTotal);
  }
  return linesTotal;
}

export function calculateServicesTotal(services) {
  return sumLines(services);
}

export function derivePaymentStatus(grandTotal, netPaid) {
  const total = roundMoney(grandTotal);
  const paid = roundMoney(netPaid);
  if (paid <= MONEY_EPSILON) return total <= MONEY_EPSILON ? 'paid' : 'unpaid';
  if (paid < total - MONEY_EPSILON) return 'partial';
  if (paid <= total + MONEY_EPSILON) return 'paid';
  return 'overpaid';
}

/** Sums a list of payments ({ type, amount, void }) into paid / refunded, ignoring voided entries. */
export function summarizePayments(payments) {
  let paid = 0;
  let refunded = 0;
  for (const payment of payments ?? []) {
    if (payment.void?.at) continue;
    if (payment.type === 'refund') refunded += amount(payment.amount);
    else paid += amount(payment.amount);
  }
  return { paid: roundMoney(paid), refunded: roundMoney(refunded) };
}

/**
 * @param {object} booking { guestCount, menu, services, charges: { hall, decoration, other, discount, taxRate } }
 * @param {object} [collected] { paid, refunded } — see summarizePayments
 */
export function calculateBookingTotals(booking, collected = {}) {
  const charges = booking?.charges ?? {};
  const hall = roundMoney(charges.hall);
  const decoration = roundMoney(charges.decoration);
  const other = roundMoney(charges.other);
  const menu = calculateMenuCharges(booking?.menu, booking?.guestCount);
  const services = calculateServicesTotal(booking?.services);

  const subtotal = roundMoney(hall + menu + decoration + services + other);
  const discount = roundMoney(charges.discount);
  const taxable = roundMoney(subtotal - discount);
  const taxRate = amount(charges.taxRate);
  const tax = roundMoney((taxable * taxRate) / 100);
  const grandTotal = roundMoney(taxable + tax);

  const paid = roundMoney(collected.paid);
  const refunded = roundMoney(collected.refunded);
  const netPaid = roundMoney(paid - refunded);
  const balance = roundMoney(grandTotal - netPaid);

  return {
    hall,
    menu,
    decoration,
    services,
    other,
    subtotal,
    discount,
    taxable,
    taxRate,
    tax,
    grandTotal,
    paid,
    refunded,
    netPaid,
    balance,
    paymentStatus: derivePaymentStatus(grandTotal, netPaid),
  };
}

/** Human-readable problems that make a booking's money invalid. Empty array = valid. */
export function getFinanceIssues(booking, totals) {
  const issues = [];
  const charges = booking?.charges ?? {};
  const moneyFields = [
    ['hall', 'Hall charges'],
    ['decoration', 'Decoration charges'],
    ['other', 'Other charges'],
    ['discount', 'Discount'],
  ];
  for (const [field, label] of moneyFields) {
    if (amount(charges[field]) < 0) issues.push({ field: `charges.${field}`, message: `${label} cannot be negative` });
  }
  const taxRate = amount(charges.taxRate);
  if (taxRate < 0 || taxRate > 100) issues.push({ field: 'charges.taxRate', message: 'Tax rate must be between 0 and 100%' });
  if (totals.discount > totals.subtotal + MONEY_EPSILON) {
    issues.push({ field: 'charges.discount', message: 'Discount cannot be more than the subtotal' });
  }
  const lines = [...(booking?.services ?? []), ...(booking?.menu?.items ?? [])];
  if (lines.some((line) => amount(line.quantity) < 0 || amount(line.unitPrice) < 0)) {
    issues.push({ field: 'lines', message: 'Quantities and prices cannot be negative' });
  }
  if (booking?.menu?.mode === 'package' && amount(booking.menu.package?.rate) < 0) {
    issues.push({ field: 'menu.package.rate', message: 'Package price cannot be negative' });
  }
  return issues;
}

/** Suggests the payment type for a new receipt given the booking totals and the amount being received. */
export function suggestPaymentType(totals, paymentAmount) {
  const netPaid = roundMoney(totals?.netPaid);
  const balance = roundMoney(totals?.balance);
  if (amount(paymentAmount) >= balance - MONEY_EPSILON) return 'final';
  return netPaid <= MONEY_EPSILON ? 'advance' : 'installment';
}
