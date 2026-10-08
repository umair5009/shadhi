import { useState } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { KeyRound, Pencil, UserPlus, UserCog } from 'lucide-react';
import { rolesApi, usersApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useListParams } from '@/lib/hooks';
import { formatDateTime, formatRelative } from '@/lib/format';
import { requiredText, optionalPhone, passwordRule } from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput, Avatar } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterSelect } from '@/components/ui/Filters';
import { SelectField, SwitchField, TextField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';

const createSchema = z.object({
  name: requiredText('Name', 100),
  email: z.string().trim().email('Enter a valid email'),
  phone: optionalPhone(),
  role: z.string().min(1, 'Choose a role'),
  password: passwordRule,
});

const editSchema = z.object({
  name: requiredText('Name', 100),
  phone: optionalPhone(),
  role: z.string().min(1, 'Choose a role'),
  isActive: z.boolean(),
});

function UserDialog(props) {
  return props.open ? <UserDialogBody {...props} /> : null;
}

function UserDialogBody({ onClose, user, roles }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(user);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit ? { name: user.name, phone: user.phone ?? '', role: user.role?._id, isActive: user.isActive } : { name: '', email: '', phone: '', role: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) await usersApi.update(user._id, values);
      else await usersApi.create(values);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(isEdit ? 'User updated' : `${values.name} can now sign in`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, ['name', 'email', 'phone', 'role', 'password', 'isActive']);
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${user.name}` : 'Add user'}
      description={isEdit ? user.email : 'They sign in with this email and password. Ask them to change the password after the first sign-in.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add user'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="user-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <TextField name="name" label="Full name" required autoFocus className="span-all" />
          {!isEdit && <TextField name="email" label="Email" type="email" required className="span-all" autoComplete="off" />}
          <TextField name="phone" label="Phone" type="tel" />
          <SelectField name="role" label="Role" required placeholder="Choose a role" options={roles.map((role) => ({ value: role._id, label: role.name }))} />
          {!isEdit && <TextField name="password" label="Temporary password" type="password" required autoComplete="new-password" className="span-all" hint="At least 8 characters with a letter and a number" />}
          {isEdit && <SwitchField name="isActive" label="Can sign in" hint="Turning this off signs the user out everywhere" />}
        </form>
      </FormProvider>
    </Dialog>
  );
}

function ResetPasswordDialog(props) {
  return props.user ? <ResetPasswordBody {...props} /> : null;
}

function ResetPasswordBody({ user, onClose }) {
  const form = useForm({ resolver: zodResolver(z.object({ password: passwordRule })), defaultValues: { password: '' } });
  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      const result = await usersApi.resetPassword(user._id, { password });
      toast.success(result.message);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, ['password']);
    }
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Set a new password for ${user.name}`}
      description="They will be signed out of all devices and must use the new password."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reset-form" variant="primary" loading={form.formState.isSubmitting}>
            Set password
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="reset-form" onSubmit={onSubmit} noValidate>
          <TextField name="password" label="New password" type="password" autoComplete="new-password" autoFocus />
        </form>
      </FormProvider>
    </Dialog>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [params, setParams] = useListParams({ page: 1 });
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const query = { page: params.page, limit: 25, q: params.q, role: params.role, sort: params.sort };
  const users = useQuery({ queryKey: ['users', query], queryFn: () => usersApi.list(query), placeholderData: keepPreviousData });

  const columns = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'name',
      render: (row) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <Avatar name={row.name} />
          <div>
            <div className="table-primary">
              {row.name} {row._id === me._id && <Badge tone="info">You</Badge>}
            </div>
            <div className="table-secondary">{row.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (row) => <Badge tone={row.role?.key === 'super_admin' ? 'brand' : 'neutral'}>{row.role?.name}</Badge> },
    { key: 'phone', header: 'Phone', render: (row) => row.phone || '—' },
    { key: 'lastLoginAt', header: 'Last sign-in', sortKey: 'lastLoginAt', render: (row) => (row.lastLoginAt ? <span title={formatDateTime(row.lastLoginAt)}>{formatRelative(row.lastLoginAt)}</span> : <span className="muted">Never</span>) },
    { key: 'status', header: 'Status', render: (row) => (row.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Deactivated</Badge>) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="row row--end" style={{ flexWrap: 'nowrap' }}>
          <IconButton icon={KeyRound} label="Set password" size="sm" variant="ghost" onClick={() => setResetting(row)} />
          <IconButton icon={Pencil} label="Edit" size="sm" variant="ghost" onClick={() => setDialog({ user: row })} />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Who can sign in, and what their role lets them do"
        actions={
          <>
            <Button icon={UserCog} to="/settings/roles">
              Roles & permissions
            </Button>
            <Button variant="primary" icon={UserPlus} onClick={() => setDialog({})}>
              Add user
            </Button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search name, email or phone" />
          <FilterSelect label="Roles" allLabel="All roles" value={params.role} options={(roles.data ?? []).map((role) => ({ value: role._id, label: role.name }))} onChange={(role) => setParams({ role })} />
        </div>
        <DataTable
          columns={columns}
          rows={users.data?.data}
          loading={users.isLoading}
          error={users.error}
          onRetry={() => users.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          rowClassName={(row) => (row.isActive ? undefined : 'row--voided')}
          empty={<EmptyState icon={UserCog} title="No users found" />}
        />
        <Pagination meta={users.data?.meta} onPageChange={(page) => setParams({ page })} />
      </Card>
      <UserDialog open={Boolean(dialog)} onClose={() => setDialog(null)} user={dialog?.user} roles={roles.data ?? []} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}
