const express = require('express');
const { health } = require('../controllers/healthController');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const tendikRoutes = require('./tendik');
const siswaRoutes = require('./siswa');
const rombelRoutes = require('./rombel');
const periodRoutes = require('./academicPeriod');
const subjectRoutes = require('./subject');
const teachingAssignmentRoutes = require('./teachingAssignment');
const timeSlotRoutes = require('./timeSlot');
const scheduleRoutes = require('./schedule');
const attendanceRoutes = require('./attendance');
const studentNoteRoutes = require('./studentNote');
const reportRoutes = require('./report');
const dashboardRoutes = require('./dashboard');

const router = express.Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tendik', tendikRoutes);
router.use('/siswa', siswaRoutes);
router.use('/rombel', rombelRoutes);
router.use('/period', periodRoutes);
router.use('/mapel', subjectRoutes);
router.use('/pengampu', teachingAssignmentRoutes);
router.use('/jam', timeSlotRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/student-notes', studentNoteRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
