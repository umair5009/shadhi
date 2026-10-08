import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/api/endpoints';

export function useSuppliers() {
  return useQuery({ queryKey: ['inventory', 'suppliers', 'all'], queryFn: () => inventoryApi.suppliers({ limit: 100, isActive: true }).then((response) => response.data), staleTime: 60 * 1000 });
}
