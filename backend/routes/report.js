const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
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

router.get('/global', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), globalReport);
router.get('/students', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportByStudent);
router.get('/rombels', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportByRombel);
router.get('/slots', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportByTimeSlot);
router.get('/daily', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportDaily);
router.get('/monthly', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportMonthly);
router.get('/semester', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportSemester);
router.get('/range', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), reportByDateRange);

module.exports = router;
