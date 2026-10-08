import { useState } from 'react';
import { Phone, UserPlus, X } from 'lucide-react';
import { customersApi } from '@/api/endpoints';
import { AsyncCombobox } from '@/components/form/AsyncCombobox';
import { IconButton } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Controls';
import { useAuth } from '@/features/auth/AuthProvider';
import { CustomerFormDialog } from './CustomerFormDialog';

const looksLikePhone = (text) => /^[+\d\s\-()]{4,}$/.test(text.trim());

/** Finds a customer by name or phone, or adds a new one without leaving the form. */
export function CustomerPicker({ value, onChange, invalid, id }) {
  const { can } = useAuth();
  const [creating, setCreating] = useState(null);

  if (value) {
    return (
      <div className="selected-entity">
        <Avatar name={value.fullName} />
        <div className="selected-entity__body">
          <div className="table-primary">{value.fullName}</div>
          <div className="table-secondary row" style={{ gap: 6 }}>
            <Phone size={12} aria-hidden /> {value.phone}
            {value.city ? ` · ${value.city}` : ''}
          </div>
        </div>
        <IconButton icon={X} label="Change customer" size="sm" variant="ghost" onClick={() => onChange(null)} />
      </div>
    );
  }

  return (
    <>
      <AsyncCombobox
        id={id}
        queryKey="customers"
        minLength={2}
        fetchOptions={customersApi.lookup}
        onSelect={onChange}
        invalid={invalid}
        placeholder="Search by name or phone number"
        emptyText="No customer found"
        renderOption={(customer) => (
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Avatar name={customer.fullName} />
            <div style={{ minWidth: 0 }}>
              <div className="table-primary truncate">{customer.fullName}</div>
              <div className="table-secondary">
                {customer.phone}
                {customer.city ? ` · ${customer.city}` : ''}
              </div>
            </div>
          </div>
        )}
        footer={
          can('customers.create')
            ? (close, text) => (
                <button
                  type="button"
                  className="menu__item"
                  style={{ color: 'var(--brand-600)', fontWeight: 700 }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    close();
                    setCreating(looksLikePhone(text) ? { phone: text.trim() } : { fullName: text.trim() });
                  }}
                >
                  <UserPlus size={16} aria-hidden /> Add new customer{text.trim() ? ` “${text.trim()}”` : ''}
                </button>
              )
            : undefined
        }
      />
      <CustomerFormDialog open={Boolean(creating)} initialValues={creating ?? undefined} onClose={() => setCreating(null)} onSaved={onChange} onUseExisting={onChange} />
    </>
  );
}
