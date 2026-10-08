const PDFDocument = require('pdfkit');
const storage = require('../services/storage');
const { formatMoney } = require('../config/shared');

const COLORS = {
  primary: '#7A1F3D',
  accent: '#B8862B',
  ink: '#1F1720',
  muted: '#6B6270',
  line: '#E7E0D8',
  soft: '#F7F4EF',
  danger: '#B42318',
  success: '#2F7D5B',
};

const PAGE_MARGIN = 40;

function createDocument(output, { size = 'A4', layout = 'portrait', title }) {
  const doc = new PDFDocument({ size, layout, margin: PAGE_MARGIN, bufferPages: true, info: { Title: title, Producer: 'Shadi Hall' } });
  doc.pipe(output);
  return doc;
}

/** Finishes the document and resolves once everything has been written to the output stream. */
function finish(doc, output) {
  return new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
    doc.end();
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '28 Sep 2026' — fixed month names (ICU versions differ, e.g. "Sept"). Business dates are UTC-midnight. */
function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${((hours + 11) % 12) + 1}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowThousand(number) {
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  const parts = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20) parts.push(`${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ''}`);
  else if (rest) parts.push(ONES[rest]);
  return parts.join(' ');
}

/** 1550000 → "Fifteen Lakh Fifty Thousand" (South Asian numbering, as written on cheques and receipts). */
function amountInWords(amount) {
  let number = Math.floor(Math.abs(amount));
  if (number === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(number / 10000000);
  number %= 10000000;
  const lakh = Math.floor(number / 100000);
  number %= 100000;
  const thousand = Math.floor(number / 1000);
  number %= 1000;
  if (crore) parts.push(`${crore >= 100 ? amountInWords(crore) : belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (number) parts.push(belowThousand(number));
  return parts.join(' ');
}

async function loadLogo(business) {
  if (!business.logo?.key || !/\.(png|jpg)$/.test(business.logo.key)) return null;
  return storage.readFile(business.logo.key);
}

/**
 * Letterhead: logo + business details on the left, document title and key facts on the right.
 * @returns {number} y position below the header
 */
async function drawHeader(doc, business, { title, facts }) {
  const top = PAGE_MARGIN;
  const logo = await loadLogo(business);
  let textX = PAGE_MARGIN;
  if (logo) {
    try {
      doc.image(logo, PAGE_MARGIN, top, { fit: [64, 64] });
      textX = PAGE_MARGIN + 76;
    } catch {
      // unreadable image: continue without it
    }
  }

  doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(18).text(business.name, textX, top, { width: 260 });
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8.5);
  const lines = [
    business.tagline,
    [business.address, business.city].filter(Boolean).join(', '),
    [business.phone, business.email].filter(Boolean).join('  ·  '),
    business.website,
    [business.tax?.ntn && `NTN ${business.tax.ntn}`, business.tax?.strn && `STRN ${business.tax.strn}`].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  for (const line of lines) doc.text(line, textX, doc.y + 1, { width: 260 });
  const leftBottom = Math.max(doc.y, top + (logo ? 64 : 0));

  const rightWidth = 240;
  const rightX = doc.page.width - PAGE_MARGIN - rightWidth;
  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(title.length > 16 ? 14 : 20).text(title, rightX, top, { width: rightWidth, align: 'right' });
  let factY = Math.max(doc.y + 6, top + 28);
  for (const [label, value, color] of facts) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(label, rightX, factY, { width: 80, align: 'left' });
    doc.font('Helvetica-Bold').fillColor(color ?? COLORS.ink).text(value, rightX + 80, factY, { width: rightWidth - 80, align: 'right' });
    factY = Math.max(doc.y, factY + 13);
  }

  const bottom = Math.max(leftBottom, factY) + 12;
  doc.moveTo(PAGE_MARGIN, bottom).lineTo(doc.page.width - PAGE_MARGIN, bottom).lineWidth(2).strokeColor(COLORS.accent).stroke();
  return bottom + 14;
}

function sectionTitle(doc, text, x, y) {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.accent).text(text.toUpperCase(), x, y, { characterSpacing: 0.8 });
  return doc.y + 4;
}

/** Label/value block, e.g. "Bill to" and "Event details". Returns the y below it. */
function drawDetails(doc, { title, x, y, width, rows }) {
  let cursor = sectionTitle(doc, title, x, y);
  for (const [label, value] of rows) {
    if (!value && value !== 0) continue;
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(label, x, cursor, { width: 80 });
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink).text(String(value), x + 80, cursor, { width: width - 80 });
    cursor = Math.max(doc.y, cursor + 12) + 2;
  }
  return cursor;
}

function ensureSpace(doc, y, needed) {
  if (y + needed > doc.page.height - PAGE_MARGIN - 30) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

/**
 * Simple table with a shaded header row and automatic page breaks.
 * @param {{ label: string, width: number, align?: 'left'|'right'|'center' }[]} columns
 * @param {string[][]} rows
 */
function drawTable(doc, { x = PAGE_MARGIN, y, columns, rows, fontSize = 9 }) {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const drawHeaderRow = (top) => {
    doc.rect(x, top, width, 20).fill(COLORS.soft);
    let cx = x;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted);
    for (const column of columns) {
      doc.text(column.label.toUpperCase(), cx + 6, top + 6, { width: column.width - 12, align: column.align ?? 'left' });
      cx += column.width;
    }
    return top + 20;
  };

  let cursor = drawHeaderRow(y);
  for (const row of rows) {
    doc.font('Helvetica').fontSize(fontSize);
    const height = Math.max(...row.map((cell, index) => doc.heightOfString(String(cell ?? ''), { width: columns[index].width - 12 }))) + 10;
    if (cursor + height > doc.page.height - PAGE_MARGIN - 30) {
      doc.addPage();
      cursor = drawHeaderRow(PAGE_MARGIN);
    }
    let cx = x;
    row.forEach((cell, index) => {
      doc.font('Helvetica').fontSize(fontSize).fillColor(COLORS.ink).text(String(cell ?? ''), cx + 6, cursor + 5, {
        width: columns[index].width - 12,
        align: columns[index].align ?? 'left',
      });
      cx += columns[index].width;
    });
    cursor += height;
    doc.moveTo(x, cursor).lineTo(x + width, cursor).lineWidth(0.5).strokeColor(COLORS.line).stroke();
  }
  return cursor;
}

/** Right-aligned label/amount rows (subtotal, discount, total…). */
function drawTotals(doc, { y, rows, width = 240 }) {
  const x = doc.page.width - PAGE_MARGIN - width;
  let cursor = ensureSpace(doc, y, rows.length * 18 + 10);
  for (const row of rows) {
    const strong = row.strong;
    if (row.highlight) doc.rect(x, cursor - 3, width, 20).fill(row.highlight);
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 10.5 : 9).fillColor(row.labelColor ?? COLORS.muted);
    doc.text(row.label, x + 8, cursor + 2, { width: width / 2 });
    doc.fillColor(row.color ?? COLORS.ink).text(row.value, x + width / 2, cursor + 2, { width: width / 2 - 8, align: 'right' });
    cursor += strong ? 22 : 17;
  }
  return cursor;
}

/** Page numbers + footer text on every page. */
function drawFooters(doc, text) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Footers sit inside the bottom margin; lift it so pdfkit doesn't start a new page for them.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - PAGE_MARGIN + 6;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted);
    if (text) doc.text(text, PAGE_MARGIN, y, { width: doc.page.width - PAGE_MARGIN * 2 - 60, lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, doc.page.width - PAGE_MARGIN - 60, y, { width: 60, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

const moneyFormatter = (currency) => (value) => formatMoney(value, currency);

module.exports = {
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
};
