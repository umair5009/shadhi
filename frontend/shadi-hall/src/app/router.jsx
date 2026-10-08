import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RootLayout } from './RootLayout';
import { RequireAuth, RedirectIfAuthenticated, RequirePermission, HomeRoute } from './guards';

// Pages are loaded on demand so the first screen stays fast.
const page = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));

const LoginPage = page(() => import('@/features/auth/AuthPages'), 'LoginPage');
const ForgotPasswordPage = page(() => import('@/features/auth/AuthPages'), 'ForgotPasswordPage');
const ResetPasswordPage = page(() => import('@/features/auth/AuthPages'), 'ResetPasswordPage');
const AccountPage = page(() => import('@/features/auth/AccountPage'), 'AccountPage');
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const BookingsPage = page(() => import('@/features/bookings/BookingsPage'), 'BookingsPage');
const BookingFormPage = page(() => import('@/features/bookings/BookingFormPage'), 'BookingFormPage');
const BookingDetailPage = page(() => import('@/features/bookings/BookingDetailPage'), 'BookingDetailPage');
const CalendarPage = page(() => import('@/features/calendar/CalendarPage'), 'CalendarPage');
const CustomersPage = page(() => import('@/features/customers/CustomersPage'), 'CustomersPage');
const CustomerDetailPage = page(() => import('@/features/customers/CustomerDetailPage'), 'CustomerDetailPage');
const HallsPage = page(() => import('@/features/halls/HallsPage'), 'HallsPage');
const HallDetailPage = page(() => import('@/features/halls/HallDetailPage'), 'HallDetailPage');
const PaymentsPage = page(() => import('@/features/payments/PaymentsPage'), 'PaymentsPage');
const InvoicesPage = page(() => import('@/features/invoices/InvoicesPage'), 'InvoicesPage');
const InvoiceViewPage = page(() => import('@/features/invoices/InvoiceViewPage'), 'InvoiceViewPage');
const ExpensesPage = page(() => import('@/features/expenses/ExpensesPage'), 'ExpensesPage');
const ReportsPage = page(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const MenuPage = page(() => import('@/features/menu/MenuPage'), 'MenuPage');
const PackagesPage = page(() => import('@/features/menu/PackagesPage'), 'PackagesPage');
const InventoryPage = page(() => import('@/features/inventory/InventoryPage'), 'InventoryPage');
const InventoryItemPage = page(() => import('@/features/inventory/InventoryItemPage'), 'InventoryItemPage');
const SuppliersPage = page(() => import('@/features/inventory/SuppliersPage'), 'SuppliersPage');
const EmployeesPage = page(() => import('@/features/staff/EmployeesPage'), 'EmployeesPage');
const EmployeeDetailPage = page(() => import('@/features/staff/EmployeeDetailPage'), 'EmployeeDetailPage');
const AttendancePage = page(() => import('@/features/staff/AttendancePage'), 'AttendancePage');
const SalariesPage = page(() => import('@/features/staff/SalariesPage'), 'SalariesPage');
const BusinessSettingsPage = page(() => import('@/features/settings/BusinessSettingsPage'), 'BusinessSettingsPage');
const UsersPage = page(() => import('@/features/settings/UsersPage'), 'UsersPage');
const RolesPage = page(() => import('@/features/settings/RolesPage'), 'RolesPage');
const SystemSettingsPage = page(() => import('@/features/settings/SystemSettingsPage'), 'SystemSettingsPage');
const NotFoundPage = page(() => import('@/features/misc/NotFoundPage'), 'NotFoundPage');

const guarded = (permission, element) => <RequirePermission permission={permission}>{element}</RequirePermission>;

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomeRoute>{guarded('dashboard.view', <DashboardPage />)}</HomeRoute> },
              { path: 'bookings', element: guarded('bookings.view', <BookingsPage />) },
              { path: 'bookings/new', element: guarded('bookings.create', <BookingFormPage />) },
              { path: 'bookings/:id', element: guarded('bookings.view', <BookingDetailPage />) },
              { path: 'bookings/:id/edit', element: guarded('bookings.update', <BookingFormPage />) },
              { path: 'calendar', element: guarded('bookings.view', <CalendarPage />) },
              { path: 'customers', element: guarded('customers.view', <CustomersPage />) },
              { path: 'customers/:id', element: guarded('customers.view', <CustomerDetailPage />) },
              { path: 'halls', element: guarded('halls.view', <HallsPage />) },
              { path: 'halls/:id', element: guarded('halls.view', <HallDetailPage />) },
              { path: 'payments', element: guarded('payments.view', <PaymentsPage />) },
              { path: 'invoices', element: guarded('invoices.view', <InvoicesPage />) },
              { path: 'invoices/:id', element: guarded('invoices.view', <InvoiceViewPage />) },
              { path: 'expenses', element: guarded('expenses.view', <ExpensesPage />) },
              { path: 'reports', element: guarded('reports.view', <ReportsPage />) },
              { path: 'menu', element: guarded('menu.view', <MenuPage />) },
              { path: 'menu/packages', element: guarded('menu.view', <PackagesPage />) },
              { path: 'inventory', element: guarded('inventory.view', <InventoryPage />) },
              { path: 'inventory/suppliers', element: guarded('inventory.view', <SuppliersPage />) },
              { path: 'inventory/:id', element: guarded('inventory.view', <InventoryItemPage />) },
              { path: 'staff', element: guarded('staff.view', <EmployeesPage />) },
              { path: 'staff/attendance', element: guarded('staff.attendance', <AttendancePage />) },
              { path: 'staff/salaries', element: guarded('staff.salaries', <SalariesPage />) },
              { path: 'staff/:id', element: guarded('staff.view', <EmployeeDetailPage />) },
              { path: 'settings/business', element: guarded('settings.view', <BusinessSettingsPage />) },
              { path: 'settings/users', element: guarded('users.manage', <UsersPage />) },
              { path: 'settings/roles', element: guarded('roles.manage', <RolesPage />) },
              { path: 'settings/system', element: guarded('settings.view', <SystemSettingsPage />) },
              { path: 'account', element: <AccountPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
