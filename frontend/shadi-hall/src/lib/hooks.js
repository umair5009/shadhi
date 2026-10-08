import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatMoney, formatMoneyCompact, DEFAULT_CURRENCY } from './format';
import { todayIn } from './dates';

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** True while the media query matches, e.g. useMediaQuery('(max-width: 720px)'). */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone-sized screen (matches the 720px breakpoint used in the stylesheets). */
export const useIsPhone = () => useMediaQuery('(max-width: 720px)');

/** Money formatting in the business's currency. */
export function useMoney() {
  const { organization } = useAuth();
  const currency = organization?.currency ?? DEFAULT_CURRENCY;
  return {
    currency,
    format: (value) => formatMoney(value, currency),
    compact: (value) => formatMoneyCompact(value, currency),
  };
}

/** Today (YYYY-MM-DD) in the business timezone. */
export function useToday() {
  const { organization } = useAuth();
  return todayIn(organization?.timezone ?? 'Asia/Karachi');
}

/**
 * List filters kept in the URL (?q=…&status=…&page=2) so filtered views survive reloads, back/forward and sharing.
 * Changing any filter resets to page 1. Pass `null` to clear a filter that has a default (e.g. "any date").
 * @param {Record<string, string|number>} defaults — define outside the component so the object is stable
 */
export function useListParams(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = { ...defaults, ...Object.fromEntries(searchParams) };
  if (params.page) params.page = Number(params.page);

  const setParams = (updates) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          // null = explicitly cleared: kept as an empty parameter so a non-empty default doesn't come back.
          if (value === null) {
            if (defaults[key] !== undefined) next.set(key, '');
            else next.delete(key);
          } else if (value === undefined || value === '' || String(value) === String(defaults[key] ?? '')) next.delete(key);
          else next.set(key, String(value));
        }
        if (!('page' in updates)) next.delete('page');
        return next;
      },
      { replace: true },
    );
  };
  return [params, setParams];
}

/**
 * Mutation with the app's standard behaviour: success toast, error toast, and cache invalidation.
 * @param {(variables: any) => Promise<any>} mutationFn
 * @param {{ success?: string | ((data: any) => string), invalidate?: unknown[][], onSuccess?: Function, onError?: Function, silentError?: boolean }} [options]
 */
export function useApiMutation(mutationFn, { success, invalidate = [], onSuccess, onError, silentError = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (success) toast.success(typeof success === 'function' ? success(data, variables) : success);
      for (const warning of data?.meta?.warnings ?? []) toast.warning(warning);
      onSuccess?.(data, variables);
    },
    onError: (error, variables) => {
      if (!silentError) toast.error(error.message ?? 'Something went wrong');
      onError?.(error, variables);
    },
  });
}
