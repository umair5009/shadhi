const {
  z,
  objectId,
  requiredText,
  optionalText,
  optionalPhone,
  money,
  dateOnly,
  optionalDateOnly,
  optionalTime,
  listQueryShape,
  csvEnum,
} = require('../../utils/validation');
const { values } = require('../../config/shared');

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const period = (label = 'Month') => z.string({ error: `${label} is required` }).regex(PERIOD, `${label} must look like 2026-09`);

const staffFields = {
  name: requiredText('Name', 100),
  phone: optionalPhone(),
  cnic: z.preprocess(
    (value) => (value === null ? '' : value),
    z.string().trim().regex(/^(\d{5}-?\d{7}-?\d)?$/, 'CNIC should look like 35202-1234567-1').optional(),
  ),
  position: z.enum(values.staffPositions),
  salary: money('Monthly salary'),
  joiningDate: dateOnly('Joining date'),
  status: z.enum(values.staffStatuses).default('active'),
  address: optionalText(300),
  notes: optionalText(1000),
};

const createBody = z.object(staffFields);
const updateBody = z.object({
  name: staffFields.name.optional(),
  phone: staffFields.phone,
  cnic: staffFields.cnic,
  position: staffFields.position.optional(),
  salary: staffFields.salary.optional(),
  joiningDate: staffFields.joiningDate.optional(),
  status: z.enum(values.staffStatuses).optional(),
  address: staffFields.address,
  notes: staffFields.notes,
});

const listQuery = z.object({
  ...listQueryShape,
  limit: listQueryShape.limit.default(50),
  position: csvEnum(values.staffPositions).optional(),
  status: csvEnum(values.staffStatuses).optional(),
});

const attendanceDayQuery = z.object({ date: dateOnly('Date') });

const attendanceBody = z.object({
  date: dateOnly('Date'),
  entries: z
    .array(
      z.object({
        staff: objectId('Choose an employee'),
        status: z.enum(values.attendanceStatuses),
        checkIn: optionalTime('Check-in time'),
        checkOut: optionalTime('Check-out time'),
        notes: optionalText(300),
      }),
    )
    .min(1, 'Mark at least one employee')
    .max(500),
});

const monthQuery = z.object({ month: period('Month') });

const salarySummaryQuery = z.object({ period: period('Month') });

const salaryBody = z
  .object({
    staff: objectId('Choose an employee'),
    period: period('Salary month'),
    grossAmount: money('Salary amount'),
    bonus: money('Bonus').default(0),
    deductions: money('Deductions').default(0),
    paidOn: optionalDateOnly('Payment date'),
    method: z.enum(values.paymentMethods).default('cash'),
    reference: optionalText(100),
    notes: optionalText(500),
  })
  .superRefine((body, issue) => {
    if (body.grossAmount + body.bonus - body.deductions <= 0) {
      issue.addIssue({ code: 'custom', path: ['grossAmount'], message: 'The amount paid must be more than zero' });
    }
  });

const salaryListQuery = z.object({
  ...listQueryShape,
  staff: objectId().optional(),
  period: period().optional(),
  from: optionalDateOnly('From date'),
  to: optionalDateOnly('To date'),
});

const voidBody = z.object({ reason: requiredText('Reason', 500) });

module.exports = {
  createBody,
  updateBody,
  listQuery,
  attendanceDayQuery,
  attendanceBody,
  monthQuery,
  salarySummaryQuery,
  salaryBody,
  salaryListQuery,
  voidBody,
};
