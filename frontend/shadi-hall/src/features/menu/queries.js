import { useQuery } from '@tanstack/react-query';
import { menuApi } from '@/api/endpoints';

/** Active menu packages with their dishes. */
export function usePackages() {
  return useQuery({ queryKey: ['menu', 'packages'], queryFn: () => menuApi.packages(), staleTime: 5 * 60 * 1000 });
}
