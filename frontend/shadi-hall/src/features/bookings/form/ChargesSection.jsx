import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { useMoney } from '@/lib/hooks';
import { lineTotal } from '@shared/bookingFinance.js';
import { MoneyField, NumberField } from '@/components/form/FormFields';
import { MoneyInput } from '@/components/form/Field';
import { Button, IconButton } from '@/components/ui/Button';

const SERVICE_SUGGESTIONS = ['Photography & video', 'Stage decoration', 'DJ & sound', 'Fireworks', 'Valet parking', 'Bridal room decor', 'Dhol / band'];

function ServiceLines() {
  const money = useMoney();
  const { control, register, formState } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'services' });
  const services = useWatch({ control, name: 'services' }) ?? [];
  const unused = SERVICE_SUGGESTIONS.filter((name) => !services.some((service) => service.name === name));

  return (
    <div className="stack stack--sm">
      <div className="field__label">Additional services</div>
      {fields.length > 0 && (
        <div className="table-wrap">
          <table className="table table--compact table--cards">
            <thead>
              <tr>
                <th>Service</th>
                <th className="num" style={{ width: 90 }}>
                  Qty
                </th>
                <th className="num" style={{ width: 160 }}>
                  Price each
                </th>
                <th className="num">Total</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id}>
                  <td className="cell--title">
                    <input className="input" style={{ height: 34 }} aria-label="Service name" {...register(`services.${index}.name`)} />
                    {formState.errors.services?.[index]?.name && <span className="field__error">{formState.errors.services[index].name.message}</span>}
                  </td>
                  <td className="num" data-label="Quantity">
                    <Controller
                      control={control}
                      name={`services.${index}.quantity`}
                      render={({ field: input }) => (
                        <input
                          className="input tabular"
                          type="number"
                          min="0"
                          aria-label="Quantity"
                          value={input.value}
                          onChange={(event) => input.onChange(event.target.value === '' ? 0 : Number(event.target.value))}
                          style={{ textAlign: 'right', height: 34 }}
                        />
                      )}
                    />
                  </td>
                  <td className="num" data-label="Price each">
                    <Controller
                      control={control}
                      name={`services.${index}.unitPrice`}
                      render={({ field: input }) => <MoneyInput aria-label="Price" value={input.value} onChange={(value) => input.onChange(value === '' ? 0 : value)} style={{ height: 34 }} />}
                    />
                  </td>
                  <td className="num strong" data-label="Total">
                    {money.format(lineTotal(services[index]?.quantity, services[index]?.unitPrice))}
                  </td>
                  <td className="cell--actions">
                    <IconButton icon={Trash2} label="Remove service" size="sm" variant="ghost" onClick={() => remove(index)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <Button size="sm" variant="subtle" icon={Plus} onClick={() => append({ name: '', quantity: 1, unitPrice: 0 })}>
          Add service
        </Button>
        {unused.slice(0, 5).map((name) => (
          <Button key={name} size="sm" variant="ghost" onClick={() => append({ name, quantity: 1, unitPrice: 0 })}>
            + {name}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ChargesSection({ hall }) {
  const money = useMoney();
  return (
    <div className="stack">
      <div className="form-grid">
        <MoneyField name="charges.hall" label="Hall charges" hint={hall ? `${hall.name} base price is ${money.format(hall.basePrice)}` : 'Choose a hall first'} />
        <MoneyField name="charges.decoration" label="Decoration" />
      </div>
      <ServiceLines />
      <div className="form-grid form-grid--3">
        <MoneyField name="charges.other" label="Other charges" />
        <MoneyField name="charges.discount" label="Discount" />
        <NumberField name="charges.taxRate" label="Tax (%)" min="0" max="100" step="0.5" />
      </div>
    </div>
  );
}
