const { getBusinessSettings, getSystemSettings } = require('../services/settings');
const { todayInTimeZone } = require('../utils/dates');
const { formatMoney } = require('../config/shared');
const {
  COLORS,
  PAGE_MARGIN,
  createDocument,
  finish,
  formatDate,
  drawHeader,
  drawTable,
  drawFooters,
  sectionTitle,
  ensureSpace,
} = require('./common');

function formatCell(column, row, currency) {
  const value = column.value ? column.value(row) : row[column.key];
  if (value === null || value === undefined || value === '') return '—';
  switch (column.type) {
    case 'money':
      return formatMoney(value, currency);
    case 'date':
      return formatDate(value);
    case 'percent':
      return `${value}%`;
    case 'number':
      return Number(value).toLocaleString('en-PK');
    default:
      return String(value);
  }
}

/** Distributes the printable width across columns by weight (default 1). */
function sizeColumns(columns, width) {
  const totalWeight = columns.reduce((sum, column) => sum + (column.weight ?? 1), 0);
  return columns.map((column) => ({
    label: column.label,
    width: (width * (column.weight ?? 1)) / totalWeight,
    align: ['money', 'number', 'percent'].includes(column.type) ? 'right' : 'left',
  }));
}

/** Landscape report: letterhead, KPI boxes, main table and any extra tables. */
async function renderReportPdf(ctx, report, output) {
  const [business, system] = await Promise.all([getBusinessSettings(ctx.organizationId), getSystemSettings(ctx.organizationId)]);
  const doc = createDocument(output, { size: 'A4', layout: 'landscape', title: report.title });

  const width = doc.page.width - PAGE_MARGIN * 2;
  let y = await drawHeader(doc, business, {
    title: report.title.toUpperCase(),
    facts: [
      ['Period', report.export.subtitle],
      ['Generated', formatDate(todayInTimeZone(system.timezone))],
    ],
  });

  const kpis = report.export.kpis ?? [];
  if (kpis.length) {
    const gap = 10;
    const boxWidth = (width - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach(([label, value], index) => {
      const x = PAGE_MARGIN + index * (boxWidth + gap);
      doc.roundedRect(x, y, boxWidth, 48, 4).fill(COLORS.soft);
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(label, x + 10, y + 9, { width: boxWidth - 20 });
      doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.ink).text(value, x + 10, y + 23, { width: boxWidth - 20 });
    });
    y += 64;
  }

  const renderTable = (title, columns, rows) => {
    y = ensureSpace(doc, y, 60);
    if (title) y = sectionTitle(doc, title, PAGE_MARGIN, y);
    if (!rows.length) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted).text('No data for this period.', PAGE_MARGIN, y + 4);
      y = doc.y + 16;
      return;
    }
    y = drawTable(doc, {
      y,
      fontSize: 8.5,
      columns: sizeColumns(columns, width),
      rows: rows.map((row) => columns.map((column) => formatCell(column, row, business.currency))),
    });
    y += 18;
  };

  renderTable(null, report.export.columns, report.export.rows);
  for (const table of report.export.extraTables ?? []) renderTable(table.title, table.columns, table.rows);

  drawFooters(doc, `${business.name} · ${report.title}`);
  await finish(doc, output);
}

module.exports = { renderReportPdf, formatCell };
