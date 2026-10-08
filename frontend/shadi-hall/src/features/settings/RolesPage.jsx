import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lock, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { rolesApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Alert, PageLoader, ErrorState } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Textarea } from '@/components/form/Field';
import { useConfirm } from '@/components/ui/ConfirmProvider';

function PermissionMatrix({ groups, value, onChange, disabled, allowed }) {
  const toggle = (key, checked) => onChange(checked ? [...new Set([...value, key])] : value.filter((entry) => entry !== key));
  return (
    <div className="permission-matrix">
      {groups.map((group) => {
        const keys = group.permissions.map((permission) => permission.key);
        const grantable = keys.filter((key) => allowed(key));
        const all = grantable.length > 0 && grantable.every((key) => value.includes(key));
        return (
          <div key={group.key} className="permission-group">
            <div className="permission-group__head">
              <strong>{group.label}</strong>
              {!disabled && grantable.length > 1 && (
                <button type="button" className="link-button" onClick={() => onChange(all ? value.filter((key) => !grantable.includes(key)) : [...new Set([...value, ...grantable])])}>
                  {all ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>
            {group.permissions.map((permission) => (
              <Checkbox
                key={permission.key}
                label={permission.label}
                checked={value.includes(permission.key)}
                disabled={disabled || (!allowed(permission.key) && !value.includes(permission.key))}
                onChange={(checked) => toggle(permission.key, checked)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function NewRoleDialog({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const create = useApiMutation(() => rolesApi.create({ name, description, permissions: [] }), {
    success: 'Role created — now choose its permissions',
    invalidate: [['roles']],
    onSuccess: (role) => {
      setName('');
      setDescription('');
      onCreated(role);
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New role"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Create role
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Role name" required>
          {({ id }) => <Input id={id} value={name} autoFocus onChange={(event) => setName(event.target.value)} placeholder="e.g. Kitchen supervisor" />}
        </Field>
        <Field label="Description">{({ id }) => <Textarea id={id} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

/** Permission editor for one role. Keyed by the role, so its draft starts from the saved permissions. */
function RoleEditor({ role, catalog, onDeleted }) {
  const { can, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState(role.permissions);
  const [saving, setSaving] = useState(false);
  const remove = useApiMutation(() => rolesApi.remove(role._id), { success: 'Role deleted', invalidate: [['roles']], onSuccess: onDeleted });
  const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...role.permissions].sort());

  const save = async () => {
    setSaving(true);
    try {
      await rolesApi.update(role._id, { permissions: draft });
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
      await refreshProfile();
      toast.success(`${role.name} permissions saved — users with this role see the change right away`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const askDelete = async () => {
    const ok = await confirm({ title: `Delete the ${role.name} role?`, message: 'Only roles with no users can be deleted.', confirmLabel: 'Delete role', danger: true });
    if (ok) remove.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="row">
            <ShieldCheck size={18} aria-hidden /> {role.name}
          </span>
        }
        subtitle={role.description}
        actions={
          !role.isLocked && (
            <>
              {!role.isSystem && (
                <Button variant="ghost" icon={Trash2} onClick={askDelete} disabled={role.userCount > 0}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(role.permissions)}>
                Undo
              </Button>
              <Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>
                Save permissions
              </Button>
            </>
          )
        }
      />
      <CardBody>
        {role.isLocked ? (
          <Alert tone="info" title="Super Admin always has full access">
            This keeps at least one role able to manage users and settings. Create a new role for limited access.
          </Alert>
        ) : (
          <PermissionMatrix groups={catalog} value={draft} onChange={setDraft} disabled={!can('roles.manage')} allowed={can} />
        )}
      </CardBody>
    </Card>
  );
}

export function RolesPage() {
  const roles = useQuery({ queryKey: ['roles'], queryFn: rolesApi.list });
  const catalog = useQuery({ queryKey: ['roles', 'permissions'], queryFn: rolesApi.permissions, staleTime: Infinity });
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  if (roles.isLoading || catalog.isLoading) return <PageLoader />;
  if (roles.isError) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  const list = roles.data;
  const selected = list.find((role) => role._id === selectedId) ?? list[0];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Decide what each role can see and do"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New role
          </Button>
        }
      />
      <div className="roles-layout">
        <Card>
          <ul className="list-plain">
            {list.map((role) => (
              <li key={role._id}>
                <button type="button" className={`role-item${role._id === selected?._id ? ' role-item--active' : ''}`} onClick={() => setSelectedId(role._id)}>
                  <span className="row row--between" style={{ flexWrap: 'nowrap' }}>
                    <strong>{role.name}</strong>
                    {role.isLocked ? <Lock size={14} aria-label="Locked" /> : role.isSystem && <Badge>Built-in</Badge>}
                  </span>
                  <span className="table-secondary">
                    {role.userCount} user{role.userCount === 1 ? '' : 's'} · {role.isLocked ? 'all' : role.permissions.length} permissions
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {selected && <RoleEditor key={`${selected._id}:${selected.updatedAt}`} role={selected} catalog={catalog.data} onDeleted={() => setSelectedId(null)} />}
      </div>
      <NewRoleDialog open={creating} onClose={() => setCreating(false)} onCreated={(role) => setSelectedId(role._id)} />
    </>
  );
}
