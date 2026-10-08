const { getBusinessSettings } = require('../services/settings');
const { labelOf, PAYMENT_METHODS, PAYMENT_TYPES, EVENT_TYPES } = require('../config/shared');
const {
  COLORS,
  PAGE_MARGIN,
  createDocument,
  finish,
  formatDate,
  amountInWords,
  drawHeader,
  drawDetails,
  drawTotals,
  drawFooters,
  moneyFormatter,
} = require('./common');

/**
 * Payment receipt (or refund voucher) for one payment.
 * @param {object} payment populated as in payments.service POPULATE
 * @param {import('stream').Writable} output
 */
async function renderReceiptPdf(ctx, payment, output) {
  const business = await getBusinessSettings(ctx.organizationId);
  const money = moneyFormatter(business.currency);
  const isRefund = payment.type === 'refund';
  const isVoid = Boolean(payment.void?.at);
  const doc = createDocument(output, { size: 'A4', title: payment.receiptNumber });

  let y = await drawHeader(doc, business, {
    title: isRefund ? 'REFUND VOUCHER' : 'PAYMENT RECEIPT',
    facts: [
      ['Receipt no.', payment.receiptNumber],
      ['Date', formatDate(payment.paidOn)],
      ['Status', isVoid ? 'VOID' : 'Valid', isVoid ? COLORS.danger : COLORS.success],
    ],
  });

  // Amount banner
  const width = doc.page.width - PAGE_MARGIN * 2;
  doc.rect(PAGE_MARGIN, y, width, 64).fill(COLORS.soft);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(isRefund ? 'Amount refunded' : 'Amount received', PAGE_MARGIN + 16, y + 12);
  doc.font('Helvetica-Bold').fontSize(24).fillColor(isRefund ? COLORS.danger : COLORS.primary).text(money(payment.amount), PAGE_MARGIN + 16, y + 26);
  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(`${business.currency?.code === 'PKR' ? 'Rupees ' : ''}${amountInWords(payment.amount)} Only`, PAGE_MARGIN + 260, y + 30, { width: width - 276, align: 'right' });
  y += 84;

  const columnWidth = (width - 30) / 2;
  const booking = payment.booking;
  const leftBottom = drawDetails(doc, {
    title: isRefund ? 'Refunded to' : 'Received from',
    x: PAGE_MARGIN,
    y,
    width: columnWidth,
    rows: [
      ['Name', payment.customer?.fullName],
      ['Phone', payment.customer?.phone],
      ['Payment type', labelOf(PAYMENT_TYPES, payment.type)],
      ['Method', labelOf(PAYMENT_METHODS, payment.method)],
      ['Reference', payment.reference],
      ['Received by', payment.receivedBy?.name],
    ],
  });
  const rightBottom = drawDetails(doc, {
    title: 'For booking',
    x: PAGE_MARGIN + columnWidth + 30,
    y,
    width: columnWidth,
    rows: [
      ['Booking no.', booking?.bookingNumber],
      ['Event', labelOf(EVENT_TYPES, booking?.eventType)],
      ['Event date', formatDate(booking?.eventDate)],
      ['Hall', booking?.hall?.name],
    ],
  });
  y = Math.max(leftBottom, rightBottom) + 16;

  if (booking?.totals) {
    y = drawTotals(doc, {
      y,
      rows: [
        { label: 'Booking total', value: money(booking.totals.grandTotal) },
        { label: 'Paid to date', value: money(booking.totals.netPaid) },
        {
          label: 'Balance remaining',
          value: money(Math.max(0, booking.totals.balance)),
          strong: true,
          color: booking.totals.balance > 0 ? COLORS.danger : COLORS.success,
          highlight: COLORS.soft,
        },
      ],
    });
  }

  if (payment.notes) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text('NOTES', PAGE_MARGIN, y + 10);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(payment.notes, PAGE_MARGIN, doc.y + 3, { width });
  }
  if (isVoid) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.danger).text(`VOIDED on ${formatDate(payment.void.at)}: ${payment.void.reason}`, PAGE_MARGIN, doc.y + 12, { width });
  }

  const signatureY = Math.max(doc.y + 60, y + 70);
  doc.moveTo(doc.page.width - PAGE_MARGIN - 180, signatureY).lineTo(doc.page.width - PAGE_MARGIN, signatureY).lineWidth(0.8).strokeColor(COLORS.muted).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text('Authorised signature', doc.page.width - PAGE_MARGIN - 180, signatureY + 4, { width: 180, align: 'center' });

  drawFooters(doc, business.invoice?.footer);
  await finish(doc, output);
}

module.exports = { renderReceiptPdf };
