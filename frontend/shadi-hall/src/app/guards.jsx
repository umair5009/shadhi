import { Navigate, Outlet, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { PageLoader, ErrorState, EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { firstAllowedPath } from './navigation';

/** Only signed-in users get past this. */
export function RequireAuth() {
  const { isLoading, user, loadError } = useAuth();
  const location = useLocation();
  if (isLoading) return <PageLoader />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => window.location.reload()} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
}

/** Signed-in users are sent away from sign-in pages. */
export function RedirectIfAuthenticated() {
  const { isLoading, user } = useAuth();
  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function Forbidden() {
  return (
    <EmptyState icon={ShieldAlert} title="You don’t have access to this page" action={<Button to="/">Go to start page</Button>}>
      Your role doesn’t include this area. Ask an administrator if you need it.
    </EmptyState>
  );
}

/** Renders the page only when the user holds `permission`. */
export function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  if (!can(permission)) return <Forbidden />;
  return children ?? <Outlet />;
}

/** Dashboard for those allowed; everyone else lands on their first permitted screen. */
export function HomeRoute({ children }) {
  const { can } = useAuth();
  if (!can('dashboard.view')) return <Navigate to={firstAllowedPath(can)} replace />;
  return children;
}
