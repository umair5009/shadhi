import { createContext, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { setSessionExpiredHandler } from '@/api/client';

const AuthContext = createContext(null);
const ME_KEY = ['auth', 'me'];

/** Signed-in user, their permissions and their business profile (currency, timezone…). */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (error) {
        if (error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.setQueryData(ME_KEY, null);
    });
  }, [queryClient]);

  const profile = me.data ?? null;
  const permissions = new Set(profile?.user.permissions ?? []);

  const value = {
    isLoading: me.isLoading,
    loadError: me.error,
    user: profile?.user ?? null,
    organization: profile?.organization ?? null,
    can: (permission) => permissions.has(permission),
    canAny: (...list) => list.some((permission) => permissions.has(permission)),
    async login(credentials) {
      const next = await authApi.login(credentials);
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, next);
      return next;
    },
    async logout() {
      await authApi.logout().catch(() => {});
      queryClient.clear();
      queryClient.setQueryData(ME_KEY, null);
    },
    refreshProfile: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
