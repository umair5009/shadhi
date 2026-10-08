import { api } from './client';

// One object per API area. Components never build URLs themselves.

const resource = (base) => ({
  list: (params) => api.get(base, params),
  get: (id) => api.get(`${base}/${id}`).then((response) => response.data),
  create: (body) => api.post(base, body),
  update: (id, body) => api.patch(`${base}/${id}`, body),
  remove: (id) => api.delete(`${base}/${id}`),
});

const upload = (path, field, files) => {
  const form = new FormData();
  for (const file of [].concat(files)) form.append(field, file);
  return api.post(path, form).then((response) => response.data);
};

export const authApi = {
  me: () => api.get('/auth/me').then((response) => response.data),
  login: (body) => api.post('/auth/login', body).then((response) => response.data),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (body) => api.post('/auth/forgot-password', body).then((response) => response.data),
  resetPassword: (body) => api.post('/auth/reset-password', body).then((response) => response.data),
  changePassword: (body) => api.post('/auth/change-password', body).then((response) => response.data),
  sessions: () => api.get('/auth/sessions').then((response) => response.data),
  revokeSession: (id) => api.delete(`/auth/sessions/${id}`),
};

export const dashboardApi = {
  get: (params) => api.get('/dashboard', params).then((response) => response.data),
};

export const hallsApi = {
  ...resource('/halls'),
  availability: (params) => api.get('/halls/availability', params).then((response) => response.data),
  addImages: (id, files) => upload(`/halls/${id}/images`, 'images', files),
  removeImage: (id, key) => api.delete(`/halls/${id}/images?key=${encodeURIComponent(key)}`).then((response) => response.data),
};

export const customersApi = {
  ...resource('/customers'),
  lookup: (q) => api.get('/customers/lookup', { q }).then((response) => response.data),
};

export const bookingsApi = {
  ...resource('/bookings'),
  calendar: (params) => api.get('/bookings/calendar', params).then((response) => response.data),
  checkAvailability: (body) => api.post('/bookings/check-availability', body).then((response) => response.data),
  changeStatus: (id, body) => api.post(`/bookings/${id}/status`, body).then((response) => response.data),
  profitability: (id) => api.get(`/bookings/${id}/profitability`).then((response) => response.data),
};

export const paymentsApi = {
  list: (params) => api.get('/payments', params),
  get: (id) => api.get(`/payments/${id}`).then((response) => response.data),
  receive: (body) => api.post('/payments', body).then((response) => response.data),
  refund: (body) => api.post('/payments/refunds', body).then((response) => response.data),
  void: (id, body) => api.post(`/payments/${id}/void`, body).then((response) => response.data),
};

export const invoicesApi = {
  list: (params) => api.get('/invoices', params),
  get: (id) => api.get(`/invoices/${id}`).then((response) => response.data),
  create: (body) => api.post('/invoices', body).then((response) => response.data),
  void: (id, body) => api.post(`/invoices/${id}/void`, body).then((response) => response.data),
};

export const menuApi = {
  categories: () => api.get('/menu/categories').then((response) => response.data),
  createCategory: (body) => api.post('/menu/categories', body),
  updateCategory: (id, body) => api.patch(`/menu/categories/${id}`, body),
  removeCategory: (id) => api.delete(`/menu/categories/${id}`),
  items: (params) => api.get('/menu/items', params),
  item: (id) => api.get(`/menu/items/${id}`).then((response) => response.data),
  createItem: (body) => api.post('/menu/items', body),
  updateItem: (id, body) => api.patch(`/menu/items/${id}`, body),
  removeItem: (id) => api.delete(`/menu/items/${id}`),
  setItemImage: (id, file) => upload(`/menu/items/${id}/image`, 'image', file),
  packages: (params) => api.get('/menu/packages', params).then((response) => response.data),
  package: (id) => api.get(`/menu/packages/${id}`).then((response) => response.data),
  createPackage: (body) => api.post('/menu/packages', body),
  updatePackage: (id, body) => api.patch(`/menu/packages/${id}`, body),
  removePackage: (id) => api.delete(`/menu/packages/${id}`).then((response) => response.data),
  usage: (params) => api.get('/menu/usage', params).then((response) => response.data),
};

export const inventoryApi = {
  items: (params) => api.get('/inventory/items', params),
  item: (id) => api.get(`/inventory/items/${id}`).then((response) => response.data),
  categories: () => api.get('/inventory/categories').then((response) => response.data),
  createItem: (body) => api.post('/inventory/items', body),
  updateItem: (id, body) => api.patch(`/inventory/items/${id}`, body),
  removeItem: (id) => api.delete(`/inventory/items/${id}`),
  reconcile: (id) => api.post(`/inventory/items/${id}/reconcile`).then((response) => response.data),
  transactions: (params) => api.get('/inventory/transactions', params),
  recordTransaction: (body) => api.post('/inventory/transactions', body).then((response) => response.data),
  suppliers: (params) => api.get('/inventory/suppliers', params),
  createSupplier: (body) => api.post('/inventory/suppliers', body),
  updateSupplier: (id, body) => api.patch(`/inventory/suppliers/${id}`, body),
  removeSupplier: (id) => api.delete(`/inventory/suppliers/${id}`),
};

export const expensesApi = {
  ...resource('/expenses'),
  categories: () => api.get('/expenses/categories').then((response) => response.data),
  createCategory: (body) => api.post('/expenses/categories', body),
  updateCategory: (id, body) => api.patch(`/expenses/categories/${id}`, body),
  void: (id, body) => api.post(`/expenses/${id}/void`, body).then((response) => response.data),
  setReceipt: (id, file) => upload(`/expenses/${id}/receipt`, 'receipt', file),
};

export const staffApi = {
  ...resource('/staff'),
  attendanceSheet: (date) => api.get('/staff/attendance', { date }).then((response) => response.data),
  saveAttendance: (body) => api.put('/staff/attendance', body).then((response) => response.data),
  attendanceSummary: (month) => api.get('/staff/attendance/summary', { month }).then((response) => response.data),
  staffAttendance: (id, month) => api.get(`/staff/${id}/attendance`, { month }).then((response) => response.data),
  salarySummary: (period) => api.get('/staff/salaries/summary', { period }).then((response) => response.data),
  salaries: (params) => api.get('/staff/salaries', params),
  paySalary: (body) => api.post('/staff/salaries', body),
  voidSalary: (id, body) => api.post(`/staff/salaries/${id}/void`, body).then((response) => response.data),
};

export const reportsApi = {
  get: (report, params) => api.get(`/reports/${report}`, params).then((response) => response.data),
};

export const settingsApi = {
  business: () => api.get('/settings/business').then((response) => response.data),
  updateBusiness: (body) => api.put('/settings/business', body).then((response) => response.data),
  uploadLogo: (file) => upload('/settings/business/logo', 'logo', file),
  removeLogo: () => api.delete('/settings/business/logo').then((response) => response.data),
  system: () => api.get('/settings/system').then((response) => response.data),
  updateSystem: (body) => api.put('/settings/system', body).then((response) => response.data),
};

export const usersApi = {
  list: (params) => api.get('/users', params),
  create: (body) => api.post('/users', body).then((response) => response.data),
  update: (id, body) => api.patch(`/users/${id}`, body).then((response) => response.data),
  resetPassword: (id, body) => api.post(`/users/${id}/reset-password`, body).then((response) => response.data),
};

export const rolesApi = {
  list: () => api.get('/roles').then((response) => response.data),
  permissions: () => api.get('/roles/permissions').then((response) => response.data),
  create: (body) => api.post('/roles', body).then((response) => response.data),
  update: (id, body) => api.patch(`/roles/${id}`, body).then((response) => response.data),
  remove: (id) => api.delete(`/roles/${id}`),
};

export const auditApi = {
  list: (params) => api.get('/audit', params),
};
