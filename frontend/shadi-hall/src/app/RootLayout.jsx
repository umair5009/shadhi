import { Outlet } from 'react-router';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { CollectPaymentProvider } from '@/features/payments/CollectPaymentProvider';

/** App-wide dialogs that need the router (confirmations, the payment dialog). */
export function RootLayout() {
  return (
    <ConfirmProvider>
      <CollectPaymentProvider>
        <Outlet />
      </CollectPaymentProvider>
    </ConfirmProvider>
  );
}
