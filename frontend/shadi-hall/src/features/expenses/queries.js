import { useQuery } from '@tanstack/react-query';
import { expensesApi } from '@/api/endpoints';

export function useExpenseCategories() {
  return useQuery({ queryKey: ['expenses', 'categories'], queryFn: expensesApi.categories, staleTime: 5 * 60 * 1000 });
}
