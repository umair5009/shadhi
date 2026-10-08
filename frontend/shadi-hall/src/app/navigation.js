import {
  LayoutDashboard,
  Building2,
  CalendarCheck,
  CalendarDays,
  Users,
  Wallet,
  FileText,
  Receipt,
  ChartColumn,
  UtensilsCrossed,
  Package,
  Boxes,
  Truck,
  BriefcaseBusiness,
  ClipboardCheck,
  Banknote,
  Store,
  UserCog,
  ShieldCheck,
  Settings,
} from 'lucide-react';

// Sidebar structure. Items the user has no permission for are hidden.
export const NAVIGATION = [
  {
    label: null,
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', end: true }],
  },
  {
    label: 'Business',
    items: [
      { to: '/bookings', label: 'Bookings', icon: CalendarCheck, permission: 'bookings.view' },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays, permission: 'bookings.view' },
      { to: '/customers', label: 'Customers', icon: Users, permission: 'customers.view' },
      { to: '/halls', label: 'Halls', icon: Building2, permission: 'halls.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/payments', label: 'Payments', icon: Wallet, permission: 'payments.view' },
      { to: '/invoices', label: 'Invoices', icon: FileText, permission: 'invoices.view' },
      { to: '/expenses', label: 'Expenses', icon: Receipt, permission: 'expenses.view' },
      { to: '/reports', label: 'Reports', icon: ChartColumn, permission: 'reports.view' },
    ],
  },
  {
    label: 'Food & Inventory',
    items: [
      { to: '/menu', label: 'Menu', icon: UtensilsCrossed, permission: 'menu.view', end: true },
      { to: '/menu/packages', label: 'Packages', icon: Package, permission: 'menu.view' },
      { to: '/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory.view', end: true },
      { to: '/inventory/suppliers', label: 'Suppliers', icon: Truck, permission: 'inventory.view' },
    ],
  },
  {
    label: 'Staff',
    items: [
      { to: '/staff', label: 'Employees', icon: BriefcaseBusiness, permission: 'staff.view', end: true },
      { to: '/staff/attendance', label: 'Attendance', icon: ClipboardCheck, permission: 'staff.attendance' },
      { to: '/staff/salaries', label: 'Salaries', icon: Banknote, permission: 'staff.salaries' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/settings/business', label: 'Business', icon: Store, permission: 'settings.view' },
      { to: '/settings/users', label: 'Users', icon: UserCog, permission: 'users.manage' },
      { to: '/settings/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: 'roles.manage' },
      { to: '/settings/system', label: 'System', icon: Settings, permission: 'settings.view' },
    ],
  },
];

/** Navigation filtered to what `can` allows, dropping empty groups. */
export function visibleNavigation(can) {
  return NAVIGATION.map((group) => ({ ...group, items: group.items.filter((item) => can(item.permission)) })).filter((group) => group.items.length);
}

/** Where to send a user whose role can't open the dashboard. */
export function firstAllowedPath(can) {
  return visibleNavigation(can)[0]?.items[0]?.to ?? '/account';
}
