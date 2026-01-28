const { Op } = require('sequelize');
const { Attendance, Student, Rombel, TeachingAssignment, AcademicPeriod } = require('../models');

const overview = async (req, res) => {
  const { periodId, dateFrom, dateTo } = req.query;

  let period = null;
  if (periodId) {
    period = await AcademicPeriod.findByPk(periodId);
  } else {
    period = await AcademicPeriod.findOne({ where: { isActive: true } });
  }

  const [studentCount, rombelCount, assignmentCount] = await Promise.all([
    Student.count(),
    Rombel.count(period ? { where: { periodId: period.id } } : undefined),
    TeachingAssignment.count(period ? { where: { periodId: period.id } } : undefined)
  ]);

  const now = new Date();
  const start = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = dateTo || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const attendanceRows = await Attendance.findAll({
    attributes: [
      'status',
      [Attendance.sequelize.fn('COUNT', Attendance.sequelize.col('status')), 'total']
    ],
    where: {
      date: { [Op.between]: [start, end] }
    },
    group: ['status']
  });

  const attendanceSummary = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  attendanceRows.forEach((row) => {
    attendanceSummary[row.status] = Number(row.get('total'));
  });

  return res.json({
    period: period ? { id: period.id, name: period.name } : null,
    students: studentCount,
    rombels: rombelCount,
    teachingAssignments: assignmentCount,
    attendanceSummary,
    dateRange: { from: start, to: end }
  });
};

module.exports = { overview };
