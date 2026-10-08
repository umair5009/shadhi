import { useState } from 'react';
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { inventoryApi } from '@/api/endpoints';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation, useListParams, useMoney } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import { requiredText, optionalText, optionalPhone, optionalEmail } from '@/lib/validation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { DataTable, Pagination } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/Controls';
import { EmptyState } from '@/components/ui/Feedback';
import { SwitchField, TextField, TextareaField } from '@/components/form/FormFields';
import { applyServerErrors } from '@/components/form/serverErrors';
import { useConfirm } from '@/components/ui/ConfirmProvider';

const schema = z.object({
  name: requiredText('Supplier name', 120),
  contactPerson: optionalText(100),
  phone: optionalPhone(),
  email: optionalEmail(),
  address: optionalText(300),
  notes: optionalText(1000),
  isActive: z.boolean(),
});

function SupplierDialog(props) {
  return props.open ? <SupplierDialogBody {...props} /> : null;
}

function SupplierDialogBody({ onClose, supplier }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(supplier);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name ?? '',
      contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
      isActive: supplier?.isActive ?? true,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) await inventoryApi.updateSupplier(supplier._id, values);
      else await inventoryApi.createSupplier(values);
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(isEdit ? 'Supplier updated' : `${values.name} added`);
      onClose();
    } catch (error) {
      applyServerErrors(error, form.setError, Object.keys(schema.shape));
    }
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${supplier.name}` : 'Add supplier'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="supplier-form" variant="primary" loading={form.formState.isSubmitting}>
            {isEdit ? 'Save changes' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <FormProvider {...form}>
        <form id="supplier-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <TextField name="name" label="Supplier name" required autoFocus className="span-all" />
          <TextField name="contactPerson" label="Contact person" />
          <TextField name="phone" label="Phone" type="tel" />
          <TextField name="email" label="Email" type="email" className="span-all" />
          <TextField name="address" label="Address" className="span-all" />
          <TextareaField name="notes" label="Notes" rows={2} className="span-all" />
          <SwitchField name="isActive" label="Active supplier" />
        </form>
      </FormProvider>
    </Dialog>
  );
}

export function SuppliersPage() {
  const money = useMoney();
  const confirm = useConfirm();
  const { can } = useAuth();
  const [dialog, setDialog] = useState(null);
  const [params, setParams] = useListParams({ page: 1 });
  const query = { page: params.page, limit: 25, q: params.q, sort: params.sort };
  const suppliers = useQuery({ queryKey: ['inventory', 'suppliers', query], queryFn: () => inventoryApi.suppliers(query), placeholderData: keepPreviousData });
  const remove = useApiMutation((id) => inventoryApi.removeSupplier(id), { success: 'Supplier deleted', invalidate: [['inventory']] });

  const columns = [
    {
      key: 'name',
      header: 'Supplier',
      sortKey: 'name',
      render: (row) => (
        <>
          <div className="table-primary">
            {row.name} {!row.isActive && <Badge>Inactive</Badge>}
          </div>
          <div className="table-secondary">{row.contactPerson}</div>
        </>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row) => (
        <>
          {row.phone && <a href={`tel:${row.phone}`}>{row.phone}</a>}
          {row.email && <div className="table-secondary">{row.email}</div>}
        </>
      ),
    },
    { key: 'items', header: 'Items supplied', align: 'right', render: (row) => row.itemCount },
    { key: 'purchased', header: 'Total purchased', align: 'right', render: (row) => money.format(row.totalPurchased) },
    { key: 'last', header: 'Last purchase', render: (row) => (row.lastPurchase ? formatDate(row.lastPurchase) : '—') },
    ...(can('inventory.manage')
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (row) => (
              <div className="row row--end" style={{ flexWrap: 'nowrap' }}>
                <IconButton icon={Pencil} label="Edit" size="sm" variant="ghost" onClick={() => setDialog({ supplier: row })} />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({ title: `Delete ${row.name}?`, message: 'Suppliers with purchase history can’t be deleted — mark them inactive instead.', confirmLabel: 'Delete', danger: true });
                    if (ok) remove.mutate(row._id);
                  }}
                />
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Who you buy stock from, and how much"
        breadcrumbs={[{ label: 'Inventory', to: '/inventory' }, { label: 'Suppliers' }]}
        actions={
          can('inventory.manage') && (
            <Button variant="primary" icon={Plus} onClick={() => setDialog({})}>
              Add supplier
            </Button>
          )
        }
      />
      <Card>
        <div className="toolbar">
          <SearchInput value={params.q ?? ''} onChange={(q) => setParams({ q })} placeholder="Search name, contact or phone" />
        </div>
        <DataTable
          columns={columns}
          rows={suppliers.data?.data}
          loading={suppliers.isLoading}
          error={suppliers.error}
          onRetry={() => suppliers.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
          empty={<EmptyState icon={Truck} title="No suppliers yet">Add the traders and rental companies you buy from.</EmptyState>}
        />
        <Pagination meta={suppliers.data?.meta} onPageChange={(page) => setParams({ page })} />
      </Card>
      <SupplierDialog open={Boolean(dialog)} onClose={() => setDialog(null)} supplier={dialog?.supplier} />
    </>
  );
}
