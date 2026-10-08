import { toast } from 'sonner';

/**
 * Puts API validation errors next to the fields they belong to; anything that can't be placed becomes a toast.
 * @param {import('@/api/client').ApiError} error
 * @param {(name: string, error: { type: string, message: string }) => void} setError react-hook-form setError
 * @param {string[]} [knownFields] field names present in the form
 */
export function applyServerErrors(error, setError, knownFields) {
  const details = Array.isArray(error?.details) ? error.details : [];
  let placed = 0;
  for (const detail of details) {
    if (!detail.field) continue;
    if (knownFields && !knownFields.some((field) => detail.field === field || detail.field.startsWith(`${field}.`))) continue;
    setError(detail.field, { type: 'server', message: detail.message });
    placed += 1;
  }
  if (placed === 0) toast.error(error?.message ?? 'Something went wrong');
}

/** Removes empty strings so optional fields are simply omitted from create requests. */
export function compact(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value !== undefined));
}
