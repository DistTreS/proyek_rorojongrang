const { Op } = require('sequelize');
const { Attendance, Student, Rombel, TeachingAssignment, AcademicPeriod } = require('../models');
const { getTeacherContext, isGuruScopedUser } = require('../services/teacherOperationalService');
const { ensureDateOrder, normalizeOptionalDateOnly } = require('../utils/temporalValidation');

const overview = async (req, res) => {
  try {
    const { periodId, dateFrom, dateTo } = req.query;

    let period = null;
    if (periodId) {
      period = await AcademicPeriod.findByPk(periodId);
    } else {
      period = await AcademicPeriod.findOne({ where: { isActive: true } });
    }

    let studentCount = 0;
    let rombelCount = 0;
    let assignmentCount = 0;
    const isGuru = isGuruScopedUser(req.user);

    if (isGuru) {
      const teacher = await getTeacherContext(req.user, { scopedOnly: true });
      if (!teacher) {
        studentCount = 0;
        rombelCount = 0;
        assignmentCount = 0;
      } else {
        const assignmentWhere = { teacherId: teacher.id };
        if (period) {
          assignmentWhere.periodId = period.id;
        }

        const assignments = await TeachingAssignment.findAll({
          attributes: ['rombelId'],
          where: assignmentWhere,
          raw: true
        });
        const rombelIds = [...new Set(assignments.map((item) => Number(item.rombelId)).filter(Boolean))];

        assignmentCount = await TeachingAssignment.count({ where: assignmentWhere });
        rombelCount = rombelIds.length;

        if (rombelIds.length) {
          const students = await Student.findAll({
            attributes: ['id'],
            include: [{
              model: Rombel,
              attributes: [],
              through: { attributes: [] },
              where: { id: { [Op.in]: rombelIds } },
              required: true
            }],
            raw: true
          });
          studentCount = [...new Set(students.map((item) => Number(item.id)).filter(Boolean))].length;
        }
      }
    } else {
      [studentCount, rombelCount, assignmentCount] = await Promise.all([
        Student.count(),
        Rombel.count(period ? { where: { periodId: period.id } } : undefined),
        TeachingAssignment.count(period ? { where: { periodId: period.id } } : undefined)
      ]);
    }

    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const normalizedDateFrom = normalizeOptionalDateOnly(dateFrom, 'dateFrom');
    const normalizedDateTo = normalizeOptionalDateOnly(dateTo, 'dateTo');
    const range = ensureDateOrder(
      normalizedDateFrom || defaultStart,
      normalizedDateTo || defaultEnd,
      {
        startLabel: 'dateFrom',
        endLabel: 'dateTo',
        errorMessage: 'dateTo harus setelah atau sama dengan dateFrom'
      }
    );

    const attendanceWhere = {
      date: { [Op.between]: [range.startDate, range.endDate] }
    };
    if (isGuru) {
      const teacher = await getTeacherContext(req.user, { scopedOnly: true });
      attendanceWhere[Op.or] = teacher
        ? [
          { teacherId: teacher.id },
          { substituteTeacherId: teacher.id }
        ]
        : [
          { teacherId: -1 },
          { substituteTeacherId: -1 }
        ];
    }

    const attendanceRows = await Attendance.findAll({
      attributes: [
        'status',
        [Attendance.sequelize.fn('COUNT', Attendance.sequelize.col('status')), 'total']
      ],
      where: attendanceWhere,
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
      dateRange: { from: range.startDate, to: range.endDate }
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Gagal memuat data dashboard' });
  }
};

module.exports = { overview };
