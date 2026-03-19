const {
  AcademicPeriod,
  Rombel,
  Subject,
  TimeSlot,
  TeachingAssignment,
  TeacherPreference,
  Tendik,
  User,
  Role
} = require('../models');
const { ROLES, getUserRoles } = require('../config/rbac');
const { serviceError } = require('../utils/serviceError');

const issue = (code, message, meta = {}) => ({
  code,
  message,
  ...meta
});

const ensurePeriodId = (periodId) => {
  const normalizedPeriodId = Number(periodId);
  if (!Number.isInteger(normalizedPeriodId) || normalizedPeriodId <= 0) {
    throw serviceError(400, 'Periode akademik tidak valid');
  }
  return normalizedPeriodId;
};

const sumWeeklyHours = (assignments) => (
  assignments.reduce((total, assignment) => total + (Number(assignment.weeklyHours) || 0), 0)
);

const mapLoads = (assignments, keyField) => {
  const grouped = new Map();

  assignments.forEach((assignment) => {
    const key = assignment[keyField];
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: null,
        totalHours: 0
      });
    }

    const entry = grouped.get(key);
    entry.totalHours += Number(assignment.weeklyHours) || 0;

    if (keyField === 'teacherId') {
      entry.name = assignment.Tendik?.name || entry.name;
    }
    if (keyField === 'rombelId') {
      entry.name = assignment.Rombel?.name || entry.name;
    }
  });

  return Array.from(grouped.values());
};

const validateAssignments = (assignments, periodId) => {
  const errors = [];
  const warnings = [];

  assignments.forEach((assignment) => {
    if (!assignment.Tendik) {
      errors.push(issue(
        'ASSIGNMENT_MISSING_TEACHER',
        `Pengampu #${assignment.id} tidak memiliki data guru yang valid`
      ));
      return;
    }

    if (!assignment.Tendik.User) {
      errors.push(issue(
        'TEACHER_USER_MISSING',
        `Guru ${assignment.Tendik.name} belum terhubung ke user sistem`
      ));
    } else {
      const roles = getUserRoles(assignment.Tendik.User);
      if (!roles.includes(ROLES.GURU)) {
        errors.push(issue(
          'TEACHER_NOT_GURU',
          `Tendik ${assignment.Tendik.name} belum memiliki role guru`
        ));
      }

      if (assignment.Tendik.User.isActive === false) {
        warnings.push(issue(
          'TEACHER_USER_INACTIVE',
          `User untuk guru ${assignment.Tendik.name} sedang nonaktif`
        ));
      }
    }

    if (!assignment.Subject) {
      errors.push(issue(
        'ASSIGNMENT_MISSING_SUBJECT',
        `Pengampu #${assignment.id} tidak memiliki data mata pelajaran yang valid`
      ));
    } else if (assignment.Subject.periodId !== periodId) {
      errors.push(issue(
        'SUBJECT_PERIOD_MISMATCH',
        `Mapel ${assignment.Subject.name} tidak berada pada periode yang dipilih`
      ));
    }

    if (!assignment.Rombel) {
      errors.push(issue(
        'ASSIGNMENT_MISSING_ROMBEL',
        `Pengampu #${assignment.id} tidak memiliki data rombel yang valid`
      ));
    } else if (assignment.Rombel.periodId !== periodId) {
      errors.push(issue(
        'ROMBEL_PERIOD_MISMATCH',
        `Rombel ${assignment.Rombel.name} tidak berada pada periode yang dipilih`
      ));
    }

    if (assignment.periodId !== periodId) {
      errors.push(issue(
        'ASSIGNMENT_PERIOD_MISMATCH',
        `Pengampu #${assignment.id} tidak sesuai dengan periode yang dipilih`
      ));
    }

    if (!Number.isInteger(assignment.weeklyHours) || assignment.weeklyHours <= 0) {
      errors.push(issue(
        'INVALID_WEEKLY_HOURS',
        `Pengampu #${assignment.id} memiliki weekly_hours yang tidak valid`
      ));
    }
  });

  return { errors, warnings };
};

const buildCapacityIssues = ({ assignments, timeSlotCount, rombelCount }) => {
  const errors = [];
  const totalWeeklyHours = sumWeeklyHours(assignments);
  const rombelLoads = mapLoads(assignments, 'rombelId');
  const teacherLoads = mapLoads(assignments, 'teacherId');

  rombelLoads
    .filter((entry) => entry.totalHours > timeSlotCount)
    .forEach((entry) => {
      errors.push(issue(
        'ROMBEL_SLOT_OVERLOAD',
        `Rombel ${entry.name || entry.id} membutuhkan ${entry.totalHours} jam, tetapi hanya tersedia ${timeSlotCount} slot`
      ));
    });

  teacherLoads
    .filter((entry) => entry.totalHours > timeSlotCount)
    .forEach((entry) => {
      errors.push(issue(
        'TEACHER_SLOT_OVERLOAD',
        `Guru ${entry.name || entry.id} membutuhkan ${entry.totalHours} jam, tetapi hanya tersedia ${timeSlotCount} slot`
      ));
    });

  if (rombelCount > 0 && totalWeeklyHours > (timeSlotCount * rombelCount)) {
    errors.push(issue(
      'GLOBAL_SLOT_CAPACITY_EXCEEDED',
      `Total kebutuhan jam ${totalWeeklyHours} melebihi kapasitas keseluruhan ${timeSlotCount * rombelCount} slot`
    ));
  }

  return {
    errors,
    summary: {
      totalWeeklyHours,
      slotCount: timeSlotCount,
      totalSlotCapacity: timeSlotCount * rombelCount,
      rombelLoads,
      teacherLoads
    }
  };
};

const validateScheduleGenerationData = async (periodId) => {
  const normalizedPeriodId = ensurePeriodId(periodId);

  const [period, rombels, subjects, timeSlots, assignments, teacherPreferences] = await Promise.all([
    AcademicPeriod.findByPk(normalizedPeriodId),
    Rombel.findAll({
      where: { periodId: normalizedPeriodId },
      attributes: ['id', 'name', 'gradeLevel', 'type', 'periodId']
    }),
    Subject.findAll({
      where: { periodId: normalizedPeriodId },
      attributes: ['id', 'name', 'code', 'type', 'periodId']
    }),
    TimeSlot.findAll({
      where: { periodId: normalizedPeriodId },
      attributes: ['id', 'periodId', 'dayOfWeek', 'startTime', 'endTime', 'label'],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
    }),
    TeachingAssignment.findAll({
      where: { periodId: normalizedPeriodId },
      include: [
        {
          model: Tendik,
          attributes: ['id', 'name', 'nip', 'position'],
          include: [
            {
              model: User,
              attributes: ['id', 'username', 'email', 'isActive'],
              include: [{ model: Role, attributes: ['id', 'name'] }]
            }
          ]
        },
        {
          model: Subject,
          attributes: ['id', 'name', 'code', 'type', 'periodId']
        },
        {
          model: Rombel,
          attributes: ['id', 'name', 'gradeLevel', 'type', 'periodId']
        }
      ],
      order: [['id', 'ASC']]
    }),
    TeacherPreference.findAll({
      where: { periodId: normalizedPeriodId },
      attributes: ['id', 'teacherId', 'periodId', 'dayOfWeek', 'startTime', 'endTime', 'preferenceType', 'notes'],
      order: [['teacherId', 'ASC'], ['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
    })
  ]);

  const errors = [];
  const warnings = [];

  if (!period) {
    errors.push(issue(
      'PERIOD_NOT_FOUND',
      'Periode akademik tidak ditemukan'
    ));
  } else if (!period.isActive) {
    errors.push(issue(
      'PERIOD_NOT_ACTIVE',
      `Periode ${period.name} belum aktif, sehingga jadwal tidak bisa digenerate`
    ));
  }

  if (!rombels.length) {
    errors.push(issue(
      'ROMBEL_EMPTY',
      'Belum ada rombel pada periode ini'
    ));
  }

  if (!subjects.length) {
    errors.push(issue(
      'SUBJECT_EMPTY',
      'Belum ada mata pelajaran pada periode ini'
    ));
  }

  if (!assignments.length) {
    errors.push(issue(
      'ASSIGNMENT_EMPTY',
      'Belum ada data pengampu pada periode ini'
    ));
  }

  if (!timeSlots.length) {
    errors.push(issue(
      'TIMESLOT_EMPTY',
      'Belum ada data time slot pada periode ini'
    ));
  }

  const assignmentValidation = validateAssignments(assignments, normalizedPeriodId);
  errors.push(...assignmentValidation.errors);
  warnings.push(...assignmentValidation.warnings);

  const teacherCount = new Set(
    assignments
      .filter((assignment) => assignment.Tendik)
      .map((assignment) => assignment.teacherId)
  ).size;

  if (assignments.length > 0 && teacherCount === 0) {
    errors.push(issue(
      'TEACHER_EMPTY',
      'Belum ada guru yang valid pada data pengampu'
    ));
  }

  const capacity = buildCapacityIssues({
    assignments,
    timeSlotCount: timeSlots.length,
    rombelCount: rombels.length
  });
  errors.push(...capacity.errors);

  return {
    valid: errors.length === 0,
    message: errors.length
      ? 'Data penjadwalan belum siap untuk generate'
      : 'Data penjadwalan siap untuk generate',
    summary: {
      period: period
        ? {
          id: period.id,
          name: period.name,
          semester: period.semester,
          isActive: period.isActive
        }
        : null,
      counts: {
        rombels: rombels.length,
        subjects: subjects.length,
        teachingAssignments: assignments.length,
        timeSlots: timeSlots.length,
        teachers: teacherCount,
        teacherPreferences: teacherPreferences.length
      },
      capacity: capacity.summary
    },
    errors,
    warnings,
    data: {
      period,
      rombels,
      subjects,
      assignments,
      timeSlots,
      teacherPreferences
    }
  };
};

module.exports = {
  validateScheduleGenerationData
};
