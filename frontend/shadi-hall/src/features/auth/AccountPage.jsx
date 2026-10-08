import { useQuery } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Laptop, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { authApi } from '@/api/endpoints';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { QueryBoundary } from '@/components/ui/Feedback';
import { Avatar } from '@/components/ui/Controls';
import { TextField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { useApiMutation } from '@/lib/hooks';
import { passwordRule } from '@/lib/validation';
import { formatDateTime, formatRelative } from '@/lib/format';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordRule, confirm: z.string() })
  .refine((values) => values.newPassword === values.confirm, { message: 'Passwords don’t match', path: ['confirm'] });

function describeDevice(userAgent = '') {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Mac OS/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' on ');
}

export function AccountPage() {
  const { user } = useAuth();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const sessions = useQuery({ queryKey: ['auth', 'sessions'], queryFn: authApi.sessions });
  const revoke = useApiMutation(authApi.revokeSession, { success: 'Device signed out', invalidate: [['auth', 'sessions']] });

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      const result = await authApi.changePassword({ currentPassword, newPassword });
      toast.success(result.message);
      form.reset();
      sessions.refetch();
    } catch (error) {
      applyServerErrors(error, form.setError, ['currentPassword', 'newPassword']);
    }
  });

  return (
    <>
      <PageHeader title="My account" subtitle="Your profile, password and signed-in devices" />
      <div className="grid grid--2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card>
            <CardBody>
              <div className="row" style={{ gap: 16 }}>
                <Avatar name={user.name} size="lg" />
                <div>
                  <div className="strong" style={{ fontSize: 18 }}>
                    {user.name}
                  </div>
                  <div className="muted">{user.email}</div>
                  <Badge tone="brand" style={{ marginTop: 6 }}>
                    {user.role.name}
                  </Badge>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Change password" subtitle="Other devices will be signed out" />
            <CardBody>
              <FormProvider {...form}>
                <form className="stack" onSubmit={onSubmit} noValidate>
                  <TextField name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
                  <TextField name="newPassword" label="New password" type="password" autoComplete="new-password" hint="At least 8 characters with a letter and a number" />
                  <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
                  <div className="form-actions">
                    <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
                      Update password
                    </Button>
                  </div>
                </form>
              </FormProvider>
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Signed-in devices" subtitle="Sign out any device you don’t recognise" />
          <QueryBoundary query={sessions}>
            {(list) => (
              <ul className="list-plain">
                {list.map((session) => (
                  <li key={session._id} className="list-row">
                    <Laptop size={20} className="muted" aria-hidden />
                    <div className="list-row__main">
                      <div className="strong">
                        {describeDevice(session.userAgent)} {session.current && <Badge tone="success">This device</Badge>}
                      </div>
                      <div className="table-secondary">
                        {session.ip} · active {formatRelative(session.lastUsedAt)} · signed in {formatDateTime(session.createdAt)}
                      </div>
                    </div>
                    {!session.current && (
                      <Button size="sm" variant="ghost" icon={LogOut} loading={revoke.isPending && revoke.variables === session._id} onClick={() => revoke.mutate(session._id)}>
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        </Card>
      </div>
    </>
  );
}
