const { Router } = require('express');
const staffService = require('./staff.service');
const schemas = require('./staff.schemas');
const validate = require('../../middleware/validate');
const { authorize } = require('../../middleware/authorize');
const { idParams } = require('../../utils/validation');

const router = Router();

// Attendance (declared before /:id so "attendance" isn't read as an id)
router.get('/attendance', authorize('staff.attendance'), validate({ query: schemas.attendanceDayQuery }), async (req, res) => {
  res.json({ data: await staffService.attendanceSheet(req.ctx, req.valid.query) });
});
router.put('/attendance', authorize('staff.attendance'), validate({ body: schemas.attendanceBody }), async (req, res) => {
  res.json({ data: await staffService.saveAttendance(req.ctx, req.valid.body) });
});
router.get('/attendance/summary', authorize('staff.view'), validate({ query: schemas.monthQuery }), async (req, res) => {
  res.json({ data: await staffService.attendanceSummary(req.ctx, req.valid.query) });
});

// Salaries
router.get('/salaries/summary', authorize('staff.salaries'), validate({ query: schemas.salarySummaryQuery }), async (req, res) => {
  res.json({ data: await staffService.salarySummary(req.ctx, req.valid.query) });
});
router.get('/salaries', authorize('staff.salaries'), validate({ query: schemas.salaryListQuery }), async (req, res) => {
  res.json(await staffService.listSalaries(req.ctx, req.valid.query));
});
router.post('/salaries', authorize('staff.salaries'), validate({ body: schemas.salaryBody }), async (req, res) => {
  const { payment, warnings } = await staffService.paySalary(req.ctx, req.valid.body);
  res.status(201).json({ data: payment, meta: { warnings } });
});
router.post('/salaries/:id/void', authorize('staff.salaries'), validate({ params: idParams, body: schemas.voidBody }), async (req, res) => {
  res.json({ data: await staffService.voidSalary(req.ctx, req.valid.params.id, req.valid.body) });
});

// Employees
router.get('/', authorize('staff.view'), validate({ query: schemas.listQuery }), async (req, res) => {
  res.json(await staffService.list(req.ctx, req.valid.query));
});
router.post('/', authorize('staff.manage'), validate({ body: schemas.createBody }), async (req, res) => {
  res.status(201).json({ data: await staffService.create(req.ctx, req.valid.body) });
});
router.get('/:id', authorize('staff.view'), validate({ params: idParams }), async (req, res) => {
  res.json({ data: await staffService.get(req.ctx, req.valid.params.id) });
});
router.get('/:id/attendance', authorize('staff.view'), validate({ params: idParams, query: schemas.monthQuery }), async (req, res) => {
  res.json({ data: await staffService.staffAttendance(req.ctx, req.valid.params.id, req.valid.query) });
});
router.patch('/:id', authorize('staff.manage'), validate({ params: idParams, body: schemas.updateBody }), async (req, res) => {
  res.json({ data: await staffService.update(req.ctx, req.valid.params.id, req.valid.body) });
});
router.delete('/:id', authorize('staff.manage'), validate({ params: idParams }), async (req, res) => {
  await staffService.remove(req.ctx, req.valid.params.id);
  res.status(204).end();
});

module.exports = router;
