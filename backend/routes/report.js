const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const {
  globalReport,
  reportByStudent,
  reportByRombel,
  reportByTimeSlot,
  reportDaily,
  reportMonthly,
  reportSemester,
  reportByDateRange
} = require('../controllers/reportController');

const router = express.Router();

router.get('/global', auth, authorize(ACCESS.reports.view), globalReport);
router.get('/students', auth, authorize(ACCESS.reports.view), reportByStudent);
router.get('/rombels', auth, authorize(ACCESS.reports.view), reportByRombel);
router.get('/slots', auth, authorize(ACCESS.reports.view), reportByTimeSlot);
router.get('/daily', auth, authorize(ACCESS.reports.view), reportDaily);
router.get('/monthly', auth, authorize(ACCESS.reports.view), reportMonthly);
router.get('/semester', auth, authorize(ACCESS.reports.view), reportSemester);
router.get('/range', auth, authorize(ACCESS.reports.view), reportByDateRange);

module.exports = router;
