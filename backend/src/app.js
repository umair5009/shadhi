const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const env = require('./config/env');
const { authenticate } = require('./middleware/authenticate');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter, rejectMongoOperators } = require('./middleware/security');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const filesRoutes = require('./modules/files/files.routes');
const hallsRoutes = require('./modules/halls/halls.routes');
const customersRoutes = require('./modules/customers/customers.routes');
const bookingsRoutes = require('./modules/bookings/bookings.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const invoicesRoutes = require('./modules/invoices/invoices.routes');
const menuRoutes = require('./modules/menu/menu.routes');
const expensesRoutes = require('./modules/expenses/expenses.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const auditRoutes = require('./modules/audit/audit.routes');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin requests and tools like curl send no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  if (env.LOG_REQUESTS && !env.isTest) app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', apiLimiter, rejectMongoOperators);

  app.get('/api/health', (_req, res) => res.json({ data: { status: 'ok', time: new Date().toISOString() } }));

  // Public (no session needed)
  app.use('/api/auth', authRoutes);

  // Everything below requires a signed-in user.
  const api = express.Router();
  api.use(authenticate);
  api.use('/users', usersRoutes);
  api.use('/roles', rolesRoutes);
  api.use('/settings', settingsRoutes);
  api.use('/files', filesRoutes);
  api.use('/halls', hallsRoutes);
  api.use('/customers', customersRoutes);
  api.use('/bookings', bookingsRoutes);
  api.use('/payments', paymentsRoutes);
  api.use('/invoices', invoicesRoutes);
  api.use('/menu', menuRoutes);
  api.use('/expenses', expensesRoutes);
  api.use('/inventory', inventoryRoutes);
  api.use('/staff', staffRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/reports', reportsRoutes);
  api.use('/audit', auditRoutes);
  app.use('/api', api);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
