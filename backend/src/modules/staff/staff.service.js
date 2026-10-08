const { Staff, Attendance, SalaryPayment, Expense } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { buildSort, paginate, searchFilter, dateRangeFilter } = require('../../utils/listQuery');
const { nextCode } = require('../../services/numbering');
const { recordAudit } = require('../../services/audit');
const { getSystemSettings, getBusinessSettings } = require('../../services/settings');
const { todayInTimeZone, toDateOnly, endOfMonthDateOnly, formatDateOnly } = require('../../utils/dates');
const expensesService = require('../expenses/expenses.service');
const { formatMoney, roundMoney, labelOf, STAFF_POSITIONS } = require('../../config/shared');

const invalid = (field, message) => ApiError.unprocessable(message, [{ field, message }]);
const monthRange = (month) => {
  const from = toDateOnly(`${month}-01`);
  return { from, to: endOfMonthDateOnly(from) };
};
const EMPTY_COUNTS = { present: 0, late: 0, half_day: 0, leave: 0, absent: 0 };

async function findStaff(ctx, id) {
  const staff = await Staff.findOne({ _id: id, organizationId: ctx.organizationId });
  if (!staff) throw ApiError.notFound('Employee');
  return staff;
}

// ─── Employees ───────────────────────────────────────────────

async function list(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...searchFilter(query.q, ['name', 'phone', 'employeeCode', 'cnic']),
    ...(query.position?.length ? { position: { $in: query.position } } : {}),
    ...(query.status?.length ? { status: { $in: query.status } } : {}),
  };
  const [page, [totals]] = await Promise.all([
    paginate(Staff, filter, {
      page: query.page,
      limit: query.limit,
      sort: buildSort(query.sort, { name: 'name', joiningDate: 'joiningDate', salary: 'salary', employeeCode: 'employeeCode' }, { status: 1, name: 1 }),
    }),
    Staff.aggregate([
      { $match: { organizationId: ctx.organizationId, status: { $ne: 'terminated' } } },
      { $group: { _id: null, headcount: { $sum: 1 }, monthlyPayroll: { $sum: '$salary' } } },
    ]),
  ]);
  return { ...page, summary: { headcount: totals?.headcount ?? 0, monthlyPayroll: totals?.monthlyPayroll ?? 0 } };
}

async function get(ctx, id) {
  const staff = (await findStaff(ctx, id)).toJSON();
  const { timezone } = await getSystemSettings(ctx.organizationId);
  const month = formatDateOnly(todayInTimeZone(timezone)).slice(0, 7);
  const [attendance, salaries] = await Promise.all([
    attendanceForMonth(ctx, id, month),
    SalaryPayment.find({ organizationId: ctx.organizationId, staff: staff._id }).sort({ paidOn: -1 }).limit(12).lean(),
  ]);
  return { ...staff, attendance, salaries };
}

async function create(ctx, input) {
  const employeeCode = await nextCode(ctx.organizationId, { prefix: 'EMP', sequenceKey: 'employee' });
  const staff = await Staff.create({ ...input, employeeCode, organizationId: ctx.organizationId, createdBy: ctx.userId, updatedBy: ctx.userId });
  await recordAudit(ctx, {
    action: 'staff.created',
    entity: { kind: 'staff', id: staff._id, label: staff.name },
    summary: `Added employee ${staff.name} (${labelOf(STAFF_POSITIONS, staff.position)})`,
  });
  return staff.toJSON();
}

async function update(ctx, id, input) {
  const staff = await findStaff(ctx, id);
  const before = staff.toJSON();
  staff.set({ ...input, updatedBy: ctx.userId });
  await staff.save();
  await recordAudit(ctx, { action: 'staff.updated', entity: { kind: 'staff', id: staff._id, label: staff.name }, summary: `Updated employee ${staff.name}`, before, after: staff.toJSON() });
  return staff.toJSON();
}

async function remove(ctx, id) {
  const staff = await findStaff(ctx, id);
  const [attendance, salaries] = await Promise.all([
    Attendance.exists({ organizationId: ctx.organizationId, staff: staff._id }),
    SalaryPayment.exists({ organizationId: ctx.organizationId, staff: staff._id }),
  ]);
  if (attendance || salaries) throw ApiError.conflict(`${staff.name} has attendance or salary records. Set their status to "Left / terminated" instead.`);
  await staff.deleteOne();
  await recordAudit(ctx, { action: 'staff.deleted', entity: { kind: 'staff', id: staff._id, label: staff.name }, summary: `Deleted employee ${staff.name}` });
}

// ─── Attendance ──────────────────────────────────────────────

/** Attendance sheet for one day: every current employee with their mark (if any). */
async function attendanceSheet(ctx, { date }) {
  const [staff, records] = await Promise.all([
    Staff.find({ organizationId: ctx.organizationId, status: { $ne: 'terminated' }, joiningDate: { $lte: date } })
      .select('name employeeCode position status')
      .sort({ name: 1 })
      .lean(),
    Attendance.find({ organizationId: ctx.organizationId, date }).lean(),
  ]);
  const byStaff = new Map(records.map((record) => [String(record.staff), record]));
  const rows = staff.map((member) => ({ staff: member, record: byStaff.get(String(member._id)) ?? null }));
  const counts = { ...EMPTY_COUNTS, unmarked: 0 };
  for (const row of rows) counts[row.record?.status ?? 'unmarked'] += 1;
  return { date, rows, counts };
}

async function saveAttendance(ctx, { date, entries }) {
  const ids = entries.map((entry) => entry.staff);
  const known = await Staff.countDocuments({ organizationId: ctx.organizationId, _id: { $in: ids } });
  if (known !== new Set(ids.map(String)).size) throw invalid('entries', 'One of the employees could not be found');

  await Attendance.bulkWrite(
    entries.map((entry) => ({
      updateOne: {
        filter: { organizationId: ctx.organizationId, staff: entry.staff, date },
        update: {
          $set: { status: entry.status, checkIn: entry.checkIn, checkOut: entry.checkOut, notes: entry.notes, updatedBy: ctx.userId },
          $setOnInsert: { organizationId: ctx.organizationId, staff: entry.staff, date, createdBy: ctx.userId },
        },
        upsert: true,
      },
    })),
  );
  await recordAudit(ctx, {
    action: 'staff.attendance_marked',
    entity: { kind: 'attendance', label: formatDateOnly(date) },
    summary: `Marked attendance for ${entries.length} employee(s) on ${formatDateOnly(date)}`,
  });
  return attendanceSheet(ctx, { date });
}

async function attendanceForMonth(ctx, staffId, month) {
  const { from, to } = monthRange(month);
  const records = await Attendance.find({ organizationId: ctx.organizationId, staff: staffId, date: { $gte: from, $lte: to } }).sort({ date: 1 }).lean();
  const counts = { ...EMPTY_COUNTS };
  for (const record of records) counts[record.status] += 1;
  return { month, records, counts };
}

async function staffAttendance(ctx, staffId, { month }) {
  await findStaff(ctx, staffId);
  return attendanceForMonth(ctx, staffId, month);
}

/** Per-employee attendance counts for a month. */
async function attendanceSummary(ctx, { month }) {
  const { from, to } = monthRange(month);
  const [staff, rows] = await Promise.all([
    Staff.find({ organizationId: ctx.organizationId, status: { $ne: 'terminated' } }).select('name employeeCode position').sort({ name: 1 }).lean(),
    Attendance.aggregate([
      { $match: { organizationId: ctx.organizationId, date: { $gte: from, $lte: to } } },
      { $group: { _id: { staff: '$staff', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map();
  for (const row of rows) {
    const key = String(row._id.staff);
    counts.set(key, { ...(counts.get(key) ?? EMPTY_COUNTS), [row._id.status]: row.count });
  }
  return { month, rows: staff.map((member) => ({ staff: member, counts: counts.get(String(member._id)) ?? { ...EMPTY_COUNTS } })) };
}

// ─── Salaries ────────────────────────────────────────────────

/** Payroll for a month: what each employee is owed, what has been paid, what remains. */
async function salarySummary(ctx, { period }) {
  const { to } = monthRange(period);
  const [staff, payments] = await Promise.all([
    Staff.find({ organizationId: ctx.organizationId, joiningDate: { $lte: to }, status: { $ne: 'terminated' } })
      .select('name employeeCode position salary status')
      .sort({ name: 1 })
      .lean(),
    SalaryPayment.find({ organizationId: ctx.organizationId, period, void: { $exists: false } }).sort({ paidOn: 1 }).lean(),
  ]);
  const byStaff = new Map();
  for (const payment of payments) {
    const key = String(payment.staff);
    byStaff.set(key, [...(byStaff.get(key) ?? []), payment]);
  }
  // Include employees who have left but were paid this month.
  const paidIds = new Set(payments.map((payment) => String(payment.staff)));
  const missing = [...paidIds].filter((id) => !staff.some((member) => String(member._id) === id));
  if (missing.length) staff.push(...(await Staff.find({ _id: { $in: missing } }).select('name employeeCode position salary status').lean()));

  const rows = staff.map((member) => {
    const memberPayments = byStaff.get(String(member._id)) ?? [];
    const paid = roundMoney(memberPayments.reduce((sum, payment) => sum + payment.grossAmount, 0));
    const netPaid = roundMoney(memberPayments.reduce((sum, payment) => sum + payment.netAmount, 0));
    return { staff: member, salary: member.salary, paid, netPaid, remaining: roundMoney(Math.max(0, member.salary - paid)), payments: memberPayments };
  });
  const totals = rows.reduce(
    (sum, row) => ({ salary: sum.salary + row.salary, paid: sum.paid + row.paid, netPaid: sum.netPaid + row.netPaid, remaining: sum.remaining + row.remaining }),
    { salary: 0, paid: 0, netPaid: 0, remaining: 0 },
  );
  return { period, rows, totals };
}

async function listSalaries(ctx, query) {
  const filter = {
    organizationId: ctx.organizationId,
    ...(query.staff ? { staff: query.staff } : {}),
    ...(query.period ? { period: query.period } : {}),
    ...dateRangeFilter('paidOn', query.from, query.to),
  };
  return paginate(SalaryPayment, filter, {
    page: query.page,
    limit: query.limit,
    sort: buildSort(query.sort, { paidOn: 'paidOn', period: 'period', netAmount: 'netAmount' }, { paidOn: -1 }),
    populate: [{ path: 'staff', select: 'name employeeCode position' }, { path: 'expense', select: 'expenseNumber' }, { path: 'createdBy', select: 'name' }],
  });
}

/** Pays salary and posts the matching Salary expense. */
async function paySalary(ctx, input) {
  const staff = await findStaff(ctx, input.staff);
  const [{ timezone }, { currency }] = await Promise.all([getSystemSettings(ctx.organizationId), getBusinessSettings(ctx.organizationId)]);
  const paidOn = input.paidOn ?? todayInTimeZone(timezone);
  const netAmount = roundMoney(input.grossAmount + input.bonus - input.deductions);

  const alreadyPaid = await SalaryPayment.aggregate([
    { $match: { organizationId: ctx.organizationId, staff: staff._id, period: input.period, void: { $exists: false } } },
    { $group: { _id: null, gross: { $sum: '$grossAmount' } } },
  ]);
  const warnings = [];
  const grossSoFar = (alreadyPaid[0]?.gross ?? 0) + input.grossAmount;
  if (grossSoFar > staff.salary + 0.005) {
    warnings.push(`${staff.name} has now been paid ${formatMoney(grossSoFar, currency)} for ${input.period}, more than the monthly salary of ${formatMoney(staff.salary, currency)}`);
  }

  const payment = await SalaryPayment.create({
    ...input,
    staff: staff._id,
    paidOn,
    netAmount,
    organizationId: ctx.organizationId,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  const expense = await expensesService.create(ctx, {
    categoryKey: 'salary',
    amount: netAmount,
    date: paidOn,
    description: `Salary ${input.period} — ${staff.name} (${staff.employeeCode})`,
    vendor: staff.name,
    staff: staff._id,
    paymentMethod: input.method,
    reference: input.reference,
    source: 'salary',
    sourceRef: payment._id,
  });
  payment.expense = expense._id;
  await payment.save();

  await recordAudit(ctx, {
    action: 'staff.salary_paid',
    entity: { kind: 'staff', id: staff._id, label: staff.name },
    summary: `Paid ${formatMoney(netAmount, currency)} salary to ${staff.name} for ${input.period}`,
  });
  return { payment: payment.toJSON(), warnings };
}

async function voidSalary(ctx, id, { reason }) {
  const payment = await SalaryPayment.findOne({ _id: id, organizationId: ctx.organizationId }).populate('staff', 'name');
  if (!payment) throw ApiError.notFound('Salary payment');
  if (payment.void?.at) throw ApiError.badRequest('This salary payment is already void');
  payment.set({ void: { at: new Date(), by: ctx.userId, reason }, updatedBy: ctx.userId });
  await payment.save();
  if (payment.expense) {
    const expense = await Expense.findById(payment.expense).select('void').lean();
    if (!expense?.void) await expensesService.voidExpense(ctx, payment.expense, { reason: `Salary payment voided: ${reason}` }, { fromSource: true });
  }
  await recordAudit(ctx, {
    action: 'staff.salary_voided',
    entity: { kind: 'staff', id: payment.staff._id, label: payment.staff.name },
    summary: `Voided salary payment for ${payment.staff.name} (${payment.period}): ${reason}`,
  });
  return payment.toJSON();
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  attendanceSheet,
  saveAttendance,
  staffAttendance,
  attendanceSummary,
  salarySummary,
  listSalaries,
  paySalary,
  voidSalary,
};
