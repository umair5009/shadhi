// Permission catalog. Permissions live in code (not the database) so a permission check never depends on
// data state; roles store the keys they grant. The Roles screen renders these groups as a matrix.

const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'Open the dashboard' },
      { key: 'dashboard.financials', label: 'See revenue, expense and profit figures' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    permissions: [
      { key: 'customers.view', label: 'View customers' },
      { key: 'customers.create', label: 'Add customers' },
      { key: 'customers.update', label: 'Edit customers' },
      { key: 'customers.delete', label: 'Delete customers' },
    ],
  },
  {
    key: 'halls',
    label: 'Halls',
    permissions: [
      { key: 'halls.view', label: 'View halls and availability' },
      { key: 'halls.manage', label: 'Add, edit and remove halls' },
    ],
  },
  {
    key: 'bookings',
    label: 'Bookings & Calendar',
    permissions: [
      { key: 'bookings.view', label: 'View bookings and calendar' },
      { key: 'bookings.create', label: 'Create bookings' },
      { key: 'bookings.update', label: 'Edit bookings and charges' },
      { key: 'bookings.status', label: 'Confirm, complete or cancel bookings' },
    ],
  },
  {
    key: 'payments',
    label: 'Payments',
    permissions: [
      { key: 'payments.view', label: 'View payments' },
      { key: 'payments.create', label: 'Receive payments' },
      { key: 'payments.refund', label: 'Record refunds' },
      { key: 'payments.void', label: 'Void payments entered by mistake' },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    permissions: [
      { key: 'invoices.view', label: 'View and print invoices' },
      { key: 'invoices.create', label: 'Generate invoices' },
      { key: 'invoices.void', label: 'Void invoices' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    permissions: [
      { key: 'expenses.view', label: 'View expenses' },
      { key: 'expenses.create', label: 'Add expenses' },
      { key: 'expenses.update', label: 'Edit expenses and categories' },
      { key: 'expenses.void', label: 'Void expenses' },
    ],
  },
  {
    key: 'menu',
    label: 'Menu & Packages',
    permissions: [
      { key: 'menu.view', label: 'View menu and packages' },
      { key: 'menu.manage', label: 'Manage menu items, categories and packages' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    permissions: [
      { key: 'inventory.view', label: 'View stock' },
      { key: 'inventory.manage', label: 'Manage items and suppliers' },
      { key: 'inventory.transact', label: 'Record stock in / out / purchases' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    permissions: [
      { key: 'staff.view', label: 'View employees' },
      { key: 'staff.manage', label: 'Add and edit employees' },
      { key: 'staff.attendance', label: 'Mark attendance' },
      { key: 'staff.salaries', label: 'Pay salaries' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'View reports' },
      { key: 'reports.export', label: 'Export reports (PDF / CSV)' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings & Administration',
    permissions: [
      { key: 'settings.view', label: 'View business and system settings' },
      { key: 'settings.update', label: 'Change business and system settings' },
      { key: 'users.manage', label: 'Manage users' },
      { key: 'roles.manage', label: 'Manage roles and permissions' },
      { key: 'audit.view', label: 'View the full audit trail' },
    ],
  },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => permission.key));

const SUPER_ADMIN_ROLE_KEY = 'super_admin';

const DEFAULT_ROLES = [
  {
    key: SUPER_ADMIN_ROLE_KEY,
    name: 'Super Admin',
    description: 'Full access to everything, including users, roles and settings.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'manager',
    name: 'Manager',
    description: 'Runs day-to-day operations: bookings, money, menu, stock, staff and reports.',
    permissions: [
      'dashboard.view', 'dashboard.financials',
      'customers.view', 'customers.create', 'customers.update',
      'halls.view',
      'bookings.view', 'bookings.create', 'bookings.update', 'bookings.status',
      'payments.view', 'payments.create', 'payments.refund',
      'invoices.view', 'invoices.create',
      'menu.view', 'menu.manage',
      'inventory.view', 'inventory.manage', 'inventory.transact',
      'expenses.view', 'expenses.create', 'expenses.update',
      'staff.view', 'staff.manage', 'staff.attendance', 'staff.salaries',
      'reports.view', 'reports.export',
    ],
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Handles money: payments, invoices, expenses and financial reports.',
    permissions: [
      'dashboard.view', 'dashboard.financials',
      'customers.view', 'bookings.view', 'halls.view',
      'payments.view', 'payments.create', 'payments.refund', 'payments.void',
      'invoices.view', 'invoices.create', 'invoices.void',
      'expenses.view', 'expenses.create', 'expenses.update', 'expenses.void',
      'staff.view', 'staff.salaries',
      'reports.view', 'reports.export',
    ],
  },
  {
    key: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk: customers, bookings, calendar and receiving payments.',
    permissions: [
      'customers.view', 'customers.create', 'customers.update',
      'halls.view', 'menu.view',
      'bookings.view', 'bookings.create', 'bookings.update',
      'payments.view', 'payments.create',
      'invoices.view',
    ],
  },
  {
    key: 'staff',
    name: 'Staff',
    description: 'Limited access: can see the event calendar.',
    permissions: ['bookings.view', 'halls.view'],
  },
];


module.exports = {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  DEFAULT_ROLES,
  SUPER_ADMIN_ROLE_KEY,
};
