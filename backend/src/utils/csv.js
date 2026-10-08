function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a text cell).
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * @param {{ key: string, label: string, value?: (row: object) => unknown }[]} columns
 * @param {object[]} rows
 */
function toCsv(columns, rows) {
  const header = columns.map((column) => escapeCell(column.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((column) => escapeCell(column.value ? column.value(row) : row[column.key])).join(','),
  );
  // BOM so Excel opens UTF-8 (e.g. names in Urdu) correctly.
  return `﻿${[header, ...lines].join('\r\n')}`;
}

module.exports = { toCsv };
