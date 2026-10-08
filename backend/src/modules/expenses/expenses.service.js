const { Expense, ExpenseCategory, Booking, Staff, Supplier, AuditLog } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, escapeRegex, dateRangeFilter } = require('../../utils/listQuery');
const { nextDocumentNumber } = require('../../services/numbering');
const { recordAudit } = require('../../services/audit');
const { getBusinessSettings } = require('../../services/settings');
const storage = require('../../services/storage');
const { slugify } = require('../organizations/organization.service');
const { formatMoney, roundMoney, EXPENSE_SOURCES, labelOf } = require('../../config/shared');

const SORTABLE = { date: 'date', amount: 'amount', expenseNumber: 'expenseNumber', createdAt: 'createdAt' };
const POPULATE = [
  { path: 'category', select: 'name key' },
  { path: 'booking', select: 'bookingNumber eventType eventDate customer', populate: { path: 'customer', select: 'fullName' } },
  { path: 'staff', select: 'name employeeCode' },
  { path: 'supplier', select: 'name' },
  { path: 'createdBy', select: 'name' },
  { path: 'updatedBy', select: 'name' },
  { path: 'void.by', select: 'name' },
];

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);

// ─── Categories ──────────────────────────────────────────────

async function listCategories(ctx) {
  return ExpenseCategory.find({ organizationId: ctx.organizationId }).sort({ isActive: -1, name: 1 }).lean();
}

async function createCategory(ctx, input) {
  let key = slugify(input.name).replace(/-/g, '_');
  if (await ExpenseCategory.exists({ organizationId: ctx.organizationId, key })) key = `${key}_${Date.now().toString(36)}`;
  const category = await ExpenseCategory.create({ ...input, key, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, { action: 'expense.category_created', entity: { kind: 'expenseCategory', id: category._id, label: category.name }, summary: `Added expense category ${category.name}` });
  return category.toJSON();
}

async function updateCategory(ctx, id, input) {
  const category = await ExpenseCategory.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!category) throw ApiError.notFound('Category');
  if (category.isSystem && input.isActive === false && ['salary', 'inventory_purchase'].includes(category.key)) {
    throw ApiError.badRequest(`${category.name} is used for automatic entries and cannot be switched off`);
  }
  category.set({ ...input, updatedBy: ctx.userId });
  await category.save();
  return category.toJSON();
}

// ─── Expenses ────────────────────────────────────────────────

async function assertReferences(ctx, input) {
  const checks = [];
  if (input.category) {
    checks.push(
      ExpenseCategory.findOne({ _id: input.category, organizationId: ctx.organizationId }).lean().then((category) => {
        if (!category) throw invalid('category', 'Choose a valid category');
        if (!category.isActive) throw invalid('category', `${category.name} is switched off`);
      }),
    );
  }
  const refs = [
    ['booking', Booking, 'Choose a valid booking'],
    ['staff', Staff, 'Choose a valid employee'],
    ['supplier', Supplier, 'Choose a valid supplier'],
  ];
  for (const [field, model, message] of refs) {
    if (input[field]) {
      checks.push(model.exists({ _id: input[field], organizationId: ctx.organizationId }).then((exists) => {
        if (!exists) throw invalid(field, message);
      }));
    }
  }
  await Promise.all(checks);
}

async function get(ctx, id) {
  const expense = await Expense.findOne({ _id: id, organizationId: ctx.organizationId }).populate(POPULATE).lean();
  if (!expense) throw ApiError.notFound('Expense');
  const history = await AuditLog.find({ organizationId: ctx.organizationId, 'entity.kind': 'expense', 'entity.id': expense._id })
    .sort({ createdAt: -1 })
    .select('action actorName summary changes createdAt')
    .lean();
  return { ...expense, history };
}

/**
 * Creates an expense. Used by the Expenses screen and by automatic postings (salary, inventory purchase), which pass
 * `source`, `sourceRef` and a category key instead of an id.
 */
async function create(ctx, input) {
  const categoryId = input.categoryKey
    ? (await ExpenseCategory.findOne({ organizationId: ctx.organizationId, key: input.categoryKey }).select('_id').lean())?._id
    : input.category;
  if (!categoryId) throw invalid('category', 'Choose a valid category');
  const data = { ...input, category: categoryId };
  delete data.categoryKey;
  if (!input.source || input.source === 'manual') await assertReferences(ctx, data);

  const expenseNumber = await nextDocumentNumber(ctx.organizationId, { prefix: 'EXP', year: data.date.getUTCFullYear(), sequenceKey: 'expense' });
  const expense = await Expense.create({
    ...data,
    expenseNumber,
    organizationId: ctx.organizationId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });

  const { currency } = await getBusinessSettings(ctx.organizationId);
  await recordAudit(ctx, {
    action: 'expense.created',
    entity: { kind: 'expense', id: expense._id, label: expenseNumber },
    summary: `Added expense ${expenseNumber}: ${expense.description} (${formatMoney(expense.amount, currency)})`,
    after: { amount: expense.amount, date: expense.date, description: expense.description, category: String(categoryId), source: expense.source },
  });
  return expense;
}

async function findEditable(ctx, id) {
  const expense = await Expense.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!expense) throw ApiError.notFound('Expense');
  if (expense.void?.at) throw ApiError.badRequest('This expense has been voided and can no longer be changed');
  return expense;
}

async function update(ctx, id, input) {
  const expense = await findEditable(ctx, id);
  if (expense.source !== 'manual') {
    throw ApiError.badRequest(`This expense was created automatically from a ${labelOf(EXPENSE_SOURCES, expense.source).toLowerCase()} and can only be changed there`);
  }
  await assertReferences(ctx, input);
  const before = expense.toJSON();
  expense.set({ ...input, updatedBy: ctx.userId });
  await expense.save();
  await recordAudit(ctx, {
    action: 'expense.updated',
    entity: { kind: 'expense', id: expense._id, label: expense.expenseNumber },
    summary: `Edited expense ${expense.expenseNumber}`,
    before,
    after: expense.toJSON(),
  });
  return get(ctx, expense._id);
}

async function setReceipt(ctx, id, file) {
  if (!file) throw ApiError.badRequest('Choose a receipt image or PDF to upload');
  const expense = await findEditable(ctx, id);
  const previousKey = expense.receipt?.key;
  expense.receipt = await storage.saveFile(ctx.organizationId, file);
  expense.updatedBy = ctx.userId;
  await expense.save();
  if (previousKey) await storage.removeFile(previousKey);
  await recordAudit(ctx, {
    action: 'expense.receipt_attached',
    entity: { kind: 'expense', id: expense._id, label: expense.expenseNumber },
    summary: `${previousKey ? 'Replaced' : 'Attached'} receipt on expense ${expense.expenseNumber}`,
  });
  return get(ctx, expense._id);
}

/** Voids an expense (kept for the record, excluded from totals). Salary expenses are voided with their salary payment. */
async function voidExpense(ctx, id, { reason }, { fromSource = false } = {}) {
  const expense = await findEditable(ctx, id);
  if (expense.source === 'salary' && !fromSource) throw ApiError.badRequest('Salary expenses are voided by voiding the salary payment');
  expense.set({ void: { at: new Date(), by: ctx.userId, reason }, updatedBy: ctx.userId });
  await expense.save();
  const { currency } = await getBusinessSettings(ctx.organizationId);
  await recordAudit(ctx, {
    action: 'expense.voided',
    entity: { kind: 'expense', id: expense._id, label: expense.expenseNumber },
    summary: `Voided expense ${expense.expenseNumber} (${formatMoney(expense.amount, currency)}): ${reason}`,
  });
  return fromSource ? expense : get(ctx, expense._id);
}

async function buildFilter(ctx, query) {
  const filter = { organizationId: ctx.organizationId };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ description: pattern }, { vendor: pattern }, { expenseNumber: pattern }, { reference: pattern }];
  }
  if (query.category?.length) filter.category = { $in: query.category };
  if (query.booking) filter.booking = query.booking;
  if (query.staff) filter.staff = query.staff;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.source?.length) filter.source = { $in: query.source };
  if (query.paymentMethod?.length) filter.paymentMethod = { $in: query.paymentMethod };
  if (query.eventLinked !== undefined) filter.booking = query.eventLinked ? { $exists: true, $ne: null } : { $in: [null] };
  Object.assign(filter, dateRangeFilter('date', query.from, query.to));
  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    filter.amount = {};
    if (query.minAmount !== undefined) filter.amount.$gte = query.minAmount;
    if (query.maxAmount !== undefined) filter.amount.$lte = query.maxAmount;
  }
  if (!query.includeVoided) filter.void = { $exists: false };
  return filter;
}

/** Paginated expenses + the total and per-category breakdown of the whole filtered set. */
async function list(ctx, query) {
  const filter = await buildFilter(ctx, query);
  const [page, byCategory] = await Promise.all([
    paginate(Expense, filter, {
      page: query.page,
      limit: query.limit,
      sort: buildSort(query.sort, SORTABLE, { date: -1, createdAt: -1 }),
      populate: POPULATE.slice(0, 5),
    }),
    Expense.aggregate([
      { $match: { ...filter, void: { $exists: false } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $project: { _id: 0, categoryId: '$_id', name: { $first: '$category.name' }, total: 1, count: 1 } },
      { $sort: { total: -1 } },
    ]),
  ]);
  const total = roundMoney(byCategory.reduce((sum, row) => sum + row.total, 0));
  return { ...page, summary: { total, count: byCategory.reduce((sum, row) => sum + row.count, 0), byCategory } };
}

/** Event-level profit: what the event is worth minus what it cost. */
async function bookingProfitability(ctx, bookingId) {
  const booking = await Booking.findOne({ _id: bookingId, organizationId: ctx.organizationId })
    .select('bookingNumber status totals eventDate eventType')
    .lean();
  if (!booking) throw ApiError.notFound('Booking');
  const expenses = await Expense.find({ organizationId: ctx.organizationId, booking: booking._id, void: { $exists: false } })
    .populate('category', 'name')
    .sort({ date: 1 })
    .select('expenseNumber description amount date category vendor source')
    .lean();
  const totalExpenses = roundMoney(expenses.reduce((sum, expense) => sum + expense.amount, 0));
  const revenue = booking.status === 'cancelled' ? booking.totals.netPaid : booking.totals.grandTotal;
  const profit = roundMoney(revenue - totalExpenses);
  const byCategory = Object.values(
    expenses.reduce((groups, expense) => {
      const name = expense.category?.name ?? 'Other';
      groups[name] = groups[name] ?? { name, total: 0 };
      groups[name].total = roundMoney(groups[name].total + expense.amount);
      return groups;
    }, {}),
  ).sort((a, b) => b.total - a.total);
  return {
    booking: { _id: booking._id, bookingNumber: booking.bookingNumber, status: booking.status },
    revenue,
    collected: booking.totals.netPaid,
    outstanding: booking.status === 'cancelled' ? 0 : Math.max(0, booking.totals.balance),
    totalExpenses,
    profit,
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    byCategory,
    expenses,
  };
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  get,
  create,
  update,
  setReceipt,
  voidExpense,
  list,
  bookingProfitability,
};
