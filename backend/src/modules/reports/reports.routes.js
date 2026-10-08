const { Router } = require('express');
const reportsService = require('./reports.service');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const ApiError = require('../../utils/ApiError');
const { toCsv } = require('../../utils/csv');
const { formatDateOnly } = require('../../utils/dates');
const { renderReportPdf } = require('../../pdf/reportPdf');
const { z, objectId, optionalDateOnly, csvEnum } = require('../../utils/validation');
const { values } = require('../../config/shared');

const reportQuery = z
  .object({
    from: optionalDateOnly('From date'),
    to: optionalDateOnly('To date'),
    granularity: z.enum(['day', 'week', 'month', 'year']).default('month'),
    hall: objectId().optional(),
    eventType: csvEnum(values.eventTypes).optional(),
    customer: objectId().optional(),
    paymentStatus: csvEnum(values.paymentStatuses).optional(),
    format: z.enum(['json', 'csv', 'pdf']).default('json'),
  })
  .refine((query) => !query.from || !query.to || query.to >= query.from, { message: 'The end date must be after the start date', path: ['to'] })
  .refine((query) => query.granularity !== 'day' || !query.from || !query.to || query.to - query.from <= 400 * 86400000, {
    message: 'Daily figures are limited to about a year — choose weekly or monthly',
    path: ['granularity'],
  });

/** CSV cell values: plain numbers for money so spreadsheets can add them up. */
function csvColumns(columns) {
  return columns.map((column) => ({
    label: column.label,
    value: (row) => {
      const value = column.value ? column.value(row) : row[column.key];
      if (column.type === 'date' && value) return formatDateOnly(value);
      return value;
    },
  }));
}

const router = Router();
router.use(authorize('reports.view'));

for (const [path, build] of Object.entries(reportsService)) {
  router.get(`/${path}`, validate({ query: reportQuery }), async (req, res) => {
    const query = req.valid.query;
    if (query.format !== 'json' && !req.ctx.can('reports.export')) throw ApiError.forbidden('You do not have permission to export reports');
    const report = await build(req.ctx, query);
    const fileName = `${path}-report-${formatDateOnly(new Date())}`;

    if (query.format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${fileName}.csv"` });
      return res.send(toCsv(csvColumns(report.export.columns), report.export.rows));
    }
    if (query.format === 'pdf') {
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}.pdf"` });
      return renderReportPdf(req.ctx, report, res);
    }
    return res.json({ data: report.data });
  });
}

module.exports = router;
