import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Download, Gem, Printer, RefreshCw } from 'lucide-react';
import { invoicesApi } from '@/api/endpoints';
import { downloadFile } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApiMutation } from '@/lib/hooks';
import { formatDate, formatMoney, formatNumber, formatTimeRange } from '@/lib/format';
import { PAYMENT_METHODS, labelOf } from '@/lib/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/** The invoice as printed: rendered from its frozen snapshot plus live payments. */
function InvoiceDocument({ invoice }) {
  const { snapshot } = invoice;
  const money = (value) => formatMoney(value, snapshot.currency);
  const { business, customer, event, totals } = snapshot;
  const paid = invoice.payments.reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0);
  const balance = totals.grandTotal - paid;

  return (
    <article className="invoice-doc">
      {invoice.status === 'void' && <div className="invoice-doc__void">VOID</div>}
      <header className="invoice-doc__header">
        <div className="invoice-doc__brand">
          <div className="invoice-doc__logo">{business.logo?.url ? <img src={business.logo.url} alt="" /> : <Gem size={26} aria-hidden />}</div>
          <div>
            <h2>{business.name}</h2>
            {business.tagline && <p>{business.tagline}</p>}
            <p>{[business.address, business.city].filter(Boolean).join(', ')}</p>
            <p>{[business.phone, business.email].filter(Boolean).join(' · ')}</p>
            {(business.tax?.ntn || business.tax?.strn) && <p>{[business.tax?.ntn && `NTN ${business.tax.ntn}`, business.tax?.strn && `STRN ${business.tax.strn}`].filter(Boolean).join(' · ')}</p>}
          </div>
        </div>
        <div className="invoice-doc__meta">
          <h1>INVOICE</h1>
          <dl>
            <dt>Invoice no.</dt>
            <dd>{invoice.invoiceNumber}</dd>
            <dt>Issue date</dt>
            <dd>{formatDate(invoice.issueDate)}</dd>
            <dt>Due date</dt>
            <dd>{formatDate(invoice.dueDate)}</dd>
          </dl>
        </div>
      </header>

      <section className="invoice-doc__parties">
        <div>
          <h3>Bill to</h3>
          <p className="strong">{customer.fullName}</p>
          <p>{[customer.phone, customer.alternatePhone].filter(Boolean).join(' / ')}</p>
          {customer.email && <p>{customer.email}</p>}
          {(customer.address || customer.city) && <p>{[customer.address, customer.city].filter(Boolean).join(', ')}</p>}
          {customer.cnic && <p>CNIC {customer.cnic}</p>}
        </div>
        <div>
          <h3>Event</h3>
          <p className="strong">
            {event.eventTypeLabel}
            {event.title ? ` — ${event.title}` : ''}
          </p>
          <p>
            {formatDate(event.eventDate, 'EEEE, d MMMM yyyy')} · {formatTimeRange(event.startTime, event.endTime)}
          </p>
          <p>
            {event.hall} · {formatNumber(event.guestCount)} guests
          </p>
          <p>Booking {event.bookingNumber}</p>
        </div>
      </section>

      <table className="invoice-doc__lines">
        <thead>
          <tr>
            <th>Description</th>
            <th className="num">Qty</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.lines.map((line, index) => (
            <tr key={index}>
              <td>
                {line.description}
                {line.detail && <div className="invoice-doc__detail">{line.detail}</div>}
              </td>
              <td className="num">{formatNumber(line.quantity)}</td>
              <td className="num">{money(line.rate)}</td>
              <td className="num">{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-doc__bottom">
        <div className="invoice-doc__payments">
          {invoice.payments.length > 0 && (
            <>
              <h3>Payments received</h3>
              <table>
                <tbody>
                  {invoice.payments.map((payment) => (
                    <tr key={payment._id}>
                      <td>{formatDate(payment.paidOn)}</td>
                      <td>{payment.receiptNumber}</td>
                      <td>
                        {labelOf(PAYMENT_METHODS, payment.method)}
                        {payment.type === 'refund' ? ' (refund)' : ''}
                      </td>
                      <td className="num">
                        {payment.type === 'refund' ? '− ' : ''}
                        {money(payment.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        <div className="invoice-doc__totals">
          <div>
            <span>Subtotal</span>
            <span>{money(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div>
              <span>Discount</span>
              <span>− {money(totals.discount)}</span>
            </div>
          )}
          {totals.tax > 0 && (
            <div>
              <span>
                {business.tax?.label ?? 'Tax'} ({snapshot.charges.taxRate}%)
              </span>
              <span>{money(totals.tax)}</span>
            </div>
          )}
          <div className="invoice-doc__grand">
            <span>Grand total</span>
            <span>{money(totals.grandTotal)}</span>
          </div>
          <div>
            <span>Paid</span>
            <span>{money(paid)}</span>
          </div>
          <div className={`invoice-doc__due${balance <= 0.005 ? ' invoice-doc__due--settled' : ''}`}>
            <span>Balance due</span>
            <span>{money(Math.max(0, balance))}</span>
          </div>
        </div>
      </div>

      {snapshot.terms && (
        <section className="invoice-doc__terms">
          <h3>Terms & conditions</h3>
          <p>{snapshot.terms}</p>
        </section>
      )}
      {invoice.notes && (
        <section className="invoice-doc__terms">
          <h3>Notes</h3>
          <p>{invoice.notes}</p>
        </section>
      )}
      {snapshot.footer && <footer className="invoice-doc__footer">{snapshot.footer}</footer>}
    </article>
  );
}

export function InvoiceViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { can } = useAuth();
  const query = useQuery({ queryKey: ['invoices', id], queryFn: () => invoicesApi.get(id) });
  const voidInvoice = useApiMutation(({ reason }) => invoicesApi.void(id, { reason }), { success: 'Invoice voided', invalidate: [['invoices']] });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const invoice = query.data;
  const isVoid = invoice.status === 'void';

  const regenerate = async () => {
    const ok = await confirm({
      title: 'Issue an updated invoice?',
      message: `${invoice.invoiceNumber} will be marked void and a new invoice with the booking’s current charges will be issued.`,
      confirmLabel: 'Issue updated invoice',
    });
    if (!ok) return;
    try {
      const next = await invoicesApi.create({ booking: invoice.booking._id, replace: true });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Invoice ${next.invoiceNumber} issued`);
      navigate(`/invoices/${next._id}`, { replace: true });
    } catch (error) {
      toast.error(error.message);
    }
  };

  const askVoid = async () => {
    const reason = await confirm({ title: `Void ${invoice.invoiceNumber}?`, message: 'The invoice stays on record marked as void.', confirmLabel: 'Void invoice', danger: true, requireReason: true });
    if (reason) voidInvoice.mutate({ reason });
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: invoice.invoiceNumber }]}
          title={
            <>
              {invoice.invoiceNumber}
              {isVoid ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Issued</Badge>}
            </>
          }
          subtitle={`${invoice.snapshot.customer.fullName} · booking ${invoice.snapshot.event.bookingNumber}`}
          actions={
            <>
              {!isVoid && can('invoices.void') && (
                <Button variant="ghost" icon={Ban} onClick={askVoid}>
                  Void
                </Button>
              )}
              <Button icon={Download} onClick={() => downloadFile(`/invoices/${invoice._id}/pdf`, { download: 1 }).catch((error) => toast.error(error.message))}>
                Download PDF
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        />
        {isVoid && invoice.void && (
          <div style={{ marginBottom: 16 }}>
            <Alert tone="danger" title={`Voided on ${formatDate(invoice.void.at)}${invoice.void.by?.name ? ` by ${invoice.void.by.name}` : ''}`}>
              {invoice.void.reason}
              {invoice.supersededBy && (
                <>
                  {' '}
                  — see <Link to={`/invoices/${invoice.supersededBy._id}`}>{invoice.supersededBy.invoiceNumber}</Link>
                </>
              )}
            </Alert>
          </div>
        )}
        {invoice.isOutdated && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              tone="warning"
              title="The booking changed after this invoice was issued"
              action={
                can('invoices.create') && (
                  <Button size="sm" icon={RefreshCw} onClick={regenerate}>
                    Issue updated invoice
                  </Button>
                )
              }
            >
              Charges, date or guests on {invoice.snapshot.event.bookingNumber} are different now.
            </Alert>
          </div>
        )}
      </div>
      <InvoiceDocument invoice={invoice} />
    </>
  );
}
