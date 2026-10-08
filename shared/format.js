// Money formatting shared by API messages, PDFs and the web app.

export const DEFAULT_CURRENCY = { code: 'PKR', symbol: 'Rs.', locale: 'en-PK', decimals: 0 };

/**
 * formatMoney(1250000) → "Rs. 1,250,000"
 * Whole amounts show no decimals; amounts with paisa show them (up to 2).
 */
export function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  const value = Number(amount) || 0;
  const { symbol, locale, decimals } = { ...DEFAULT_CURRENCY, ...currency };
  const hasFraction = Math.round(Math.abs(value) * 100) % 100 !== 0;
  const text = Math.abs(value).toLocaleString(locale, {
    minimumFractionDigits: hasFraction ? Math.max(decimals, 2) : decimals,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? '-' : ''}${symbol} ${text}`;
}
