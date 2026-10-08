const { labelOf, PAYMENT_METHODS } = require('../config/shared');
const {
  COLORS,
  PAGE_MARGIN,
  createDocument,
  finish,
  formatDate,
  formatTime,
  amountInWords,
  drawHeader,
  drawDetails,
  drawTable,
  drawTotals,
  drawFooters,
  sectionTitle,
  ensureSpace,
  moneyFormatter,
} = require('./common');

/**
 * Renders an invoice from its frozen snapshot plus the booking's current payments.
 * @param {object} invoice result of invoices.service.get
 * @param {import('stream').Writable} output
 */
async function renderInvoicePdf(invoice, output) {
  const { snapshot } = invoice;
  const money = moneyFormatter(snapshot.currency);
  const width = () => doc.page.width - PAGE_MARGIN * 2;
  const doc = createDocument(output, { title: invoice.invoiceNumber });
  const isVoid = invoice.status === 'void';

  const paid = invoice.payments.reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0);
  const balance = snapshot.totals.grandTotal - paid;

  let y = await drawHeader(doc, snapshot.business, {
    title: 'INVOICE',
    facts: [
      ['Invoice no.', invoice.invoiceNumber],
      ['Issue date', formatDate(invoice.issueDate)],
      ['Due date', formatDate(invoice.dueDate)],
      isVoid
        ? ['Status', 'VOID', COLORS.danger]
        : ['Balance due', money(Math.max(0, balance)), balance > 0.005 ? COLORS.danger : COLORS.success],
    ],
  });

  const columnWidth = (width() - 30) / 2;
  const { customer, event } = snapshot;
  const leftBottom = drawDetails(doc, {
    title: 'Bill to',
    x: PAGE_MARGIN,
    y,
    width: columnWidth,
    rows: [
      ['Name', customer.fullName],
      ['Phone', [customer.phone, customer.alternatePhone].filter(Boolean).join(' / ')],
      ['Email', customer.email],
      ['Address', [customer.address, customer.city].filter(Boolean).join(', ')],
      ['CNIC', customer.cnic],
    ],
  });
  const rightBottom = drawDetails(doc, {
    title: 'Event',
    x: PAGE_MARGIN + columnWidth + 30,
    y,
    width: columnWidth,
    rows: [
      ['Booking no.', event.bookingNumber],
      ['Event', [event.eventTypeLabel, event.title].filter(Boolean).join(' — ')],
      ['Date', formatDate(event.eventDate)],
      ['Time', `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`],
      ['Hall', event.hall],
      ['Guests', event.guestCount],
    ],
  });
  y = Math.max(leftBottom, rightBottom) + 14;

  const total = width();
  y = drawTable(doc, {
    y,
    columns: [
      { label: 'Description', width: total - 250 },
      { label: 'Qty', width: 60, align: 'right' },
      { label: 'Rate', width: 90, align: 'right' },
      { label: 'Amount', width: 100, align: 'right' },
    ],
    rows: snapshot.lines.map((line) => [
      line.detail ? `${line.description}\n${line.detail}` : line.description,
      String(line.quantity ?? ''),
      money(line.rate),
      money(line.amount),
    ]),
  });

  const totals = snapshot.totals;
  const rows = [{ label: 'Subtotal', value: money(totals.subtotal) }];
  if (totals.discount > 0) rows.push({ label: 'Discount', value: `- ${money(totals.discount)}` });
  if (totals.tax > 0) rows.push({ label: `${snapshot.business.tax?.label ?? 'Tax'} (${snapshot.charges.taxRate}%)`, value: money(totals.tax) });
  rows.push({ label: 'Grand total', value: money(totals.grandTotal), strong: true, highlight: COLORS.soft });
  rows.push({ label: 'Paid', value: money(paid), color: COLORS.success });
  rows.push({ label: 'Balance due', value: money(Math.max(0, balance)), strong: true, color: balance > 0.005 ? COLORS.danger : COLORS.success });
  y = drawTotals(doc, { y: y + 12, rows });

  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.muted).text(`Amount in words: ${amountInWords(totals.grandTotal)} Only`, PAGE_MARGIN, y + 4, { width: total });
  y = doc.y + 16;

  if (invoice.payments.length) {
    y = ensureSpace(doc, y, 80);
    y = sectionTitle(doc, 'Payments received', PAGE_MARGIN, y);
    y = drawTable(doc, {
      y: y + 2,
      columns: [
        { label: 'Date', width: 90 },
        { label: 'Receipt', width: 120 },
        { label: 'Method', width: total - 330 },
        { label: 'Amount', width: 120, align: 'right' },
      ],
      rows: invoice.payments.map((payment) => [
        formatDate(payment.paidOn),
        payment.receiptNumber,
        `${labelOf(PAYMENT_METHODS, payment.method)}${payment.type === 'refund' ? ' (refund)' : ''}`,
        payment.type === 'refund' ? `- ${money(payment.amount)}` : money(payment.amount),
      ]),
    });
    y += 16;
  }

  if (snapshot.terms) {
    y = ensureSpace(doc, y, 60);
    y = sectionTitle(doc, 'Terms & conditions', PAGE_MARGIN, y);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(snapshot.terms, PAGE_MARGIN, y, { width: total });
    y = doc.y + 12;
  }
  if (invoice.notes) {
    y = ensureSpace(doc, y, 40);
    y = sectionTitle(doc, 'Notes', PAGE_MARGIN, y);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(invoice.notes, PAGE_MARGIN, y, { width: total });
  }

  if (isVoid) {
    doc.switchToPage(0);
    doc.save();
    doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font('Helvetica-Bold').fontSize(90).fillColor(COLORS.danger).opacity(0.12).text('VOID', 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center' });
    doc.restore();
  }

  drawFooters(doc, snapshot.footer);
  await finish(doc, output);
}

module.exports = { renderInvoicePdf };
