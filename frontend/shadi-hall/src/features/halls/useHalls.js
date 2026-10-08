import { useQuery } from '@tanstack/react-query';
import { hallsApi } from '@/api/endpoints';

/** All halls (small list), used for filters and pickers. */
export function useHalls({ includeInactive = false } = {}) {
  return useQuery({
    queryKey: ['halls', 'all', includeInactive],
    queryFn: () => hallsApi.list({ limit: 100, ...(includeInactive ? {} : { status: 'active,maintenance' }) }).then((response) => response.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHallOptions() {
  const halls = useHalls({ includeInactive: true });
  return (halls.data ?? []).map((hall) => ({ value: hall._id, label: hall.name }));
}
