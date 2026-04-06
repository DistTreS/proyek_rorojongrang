const {
  AcademicPeriod,
  Rombel,
  Subject,
  TimeSlot,
  TeachingAssignment,
  TeacherPreference,
  Student,
  Tendik,
  User,
  Role
} = require('../models');
const { ROLES, getUserRoles } = require('../config/rbac');
const { serviceError } = require('../utils/serviceError');
const { ensureTimeRange, normalizeTimeString } = require('./schedulingSupport');

const parseEnvBool = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const FIXED_MAX_TEACHER_DAILY_HOURS = 8;
const FIXED_ROMBEL_DAILY_SUBJECT_LIMIT = 5;
const ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK = parseEnvBool(
  process.env.ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK,
  false
);

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

const toTimeSeconds = (timeText) => {
  const [hour, minute, second] = String(timeText).split(':').map((part) => Number(part));
  return (hour * 3600) + (minute * 60) + second;
};

const validateTimeSlotsIntegrity = (timeSlots) => {
  const errors = [];
  const slotsPerDay = new Map();

  timeSlots.forEach((slot) => {
    const slotLabel = slot.label || `slot #${slot.id}`;
    let normalizedStartTime = null;
    let normalizedEndTime = null;
    try {
      normalizedStartTime = normalizeTimeString(slot.startTime, `Jam mulai ${slotLabel}`);
      normalizedEndTime = normalizeTimeString(slot.endTime, `Jam selesai ${slotLabel}`);
      ensureTimeRange(normalizedStartTime, normalizedEndTime);
    } catch (err) {
      errors.push(issue(
        'TIMESLOT_INVALID_RANGE',
        `Time slot ${slotLabel} memiliki rentang waktu tidak valid`
      ));
      return;
    }

    const normalizedSlot = {
      id: slot.id,
      label: slot.label,
      dayOfWeek: Number(slot.dayOfWeek),
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      startSeconds: toTimeSeconds(normalizedStartTime),
      endSeconds: toTimeSeconds(normalizedEndTime)
    };
    if (!Number.isInteger(normalizedSlot.dayOfWeek) || normalizedSlot.dayOfWeek < 1 || normalizedSlot.dayOfWeek > 6) {
      errors.push(issue(
        'TIMESLOT_INVALID_DAY',
        `Time slot ${slotLabel} memiliki hari yang tidak valid`
      ));
      return;
    }
    if (!slotsPerDay.has(normalizedSlot.dayOfWeek)) {
      slotsPerDay.set(normalizedSlot.dayOfWeek, []);
    }
    slotsPerDay.get(normalizedSlot.dayOfWeek).push(normalizedSlot);
  });

  slotsPerDay.forEach((slots, dayOfWeek) => {
    slots.sort((a, b) => {
      if (a.startSeconds !== b.startSeconds) return a.startSeconds - b.startSeconds;
      if (a.endSeconds !== b.endSeconds) return a.endSeconds - b.endSeconds;
      return Number(a.id) - Number(b.id);
    });

    for (let index = 1; index < slots.length; index += 1) {
      const previous = slots[index - 1];
      const current = slots[index];
      if (current.startSeconds < previous.endSeconds) {
        errors.push(issue(
          'TIMESLOT_OVERLAP',
          `Time slot ${current.label || `#${current.id}`} bentrok dengan ${previous.label || `#${previous.id}`} pada hari ke-${dayOfWeek}`
        ));
      }
    }
  });

  return { errors };
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

const validateAssignments = (assignments, periodId, options = {}) => {
  const errors = [];
  const warnings = [];
  const enforceRombelSubjectTypeMatch = options.enforceRombelSubjectTypeMatch !== false;

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

    if (enforceRombelSubjectTypeMatch && assignment.Rombel && assignment.Subject) {
      const isRombelUtama = assignment.Rombel.type === 'utama';
      const isRombelPeminatan = assignment.Rombel.type === 'peminatan';
      const isSubjectWajib = assignment.Subject.type === 'wajib';
      const isSubjectPeminatan = assignment.Subject.type === 'peminatan';

      if ((isRombelUtama && isSubjectPeminatan) || (isRombelPeminatan && isSubjectWajib)) {
        errors.push(issue(
          'ROMBEL_SUBJECT_TYPE_MISMATCH',
          `Pengampu #${assignment.id} tidak sesuai konsep rombel ${assignment.Rombel.type} dan mapel ${assignment.Subject.type}`
        ));
      }
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

const resolveMaxTeacherDailyHours = () => FIXED_MAX_TEACHER_DAILY_HOURS;

const validateScheduleGenerationData = async (periodId, constraints = {}) => {
  const normalizedPeriodId = ensurePeriodId(periodId);

  const [period, rombels, subjects, timeSlots, assignments, teacherPreferences, students] = await Promise.all([
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
    }),
    Student.findAll({
      attributes: ['id', 'nis', 'name'],
      include: [
        {
          model: Rombel,
          where: { periodId: normalizedPeriodId },
          through: { attributes: [] },
          required: false,
          attributes: ['id', 'name', 'type', 'periodId']
        }
      ],
      order: [['id', 'ASC']]
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
  } else {
    const timeSlotValidation = validateTimeSlotsIntegrity(timeSlots);
    errors.push(...timeSlotValidation.errors);
  }

  const assignmentValidation = validateAssignments(
    assignments,
    normalizedPeriodId,
    { enforceRombelSubjectTypeMatch: ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK }
  );
  errors.push(...assignmentValidation.errors);
  warnings.push(...assignmentValidation.warnings);

  const studentEnrollments = students
    .map((student) => ({
      studentId: student.id,
      rombelIds: [...new Set((student.Rombels || []).map((rombel) => rombel.id))]
    }))
    .filter((item) => item.rombelIds.length > 0);

  if (ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK) {
    const studentsMultiRombel = studentEnrollments.filter((item) => item.rombelIds.length > 1);
    const rombelMap = new Map(rombels.map((rombel) => [rombel.id, rombel]));
    const studentsUtamaPlusPeminatan = studentsMultiRombel.filter((item) => {
      const types = new Set(item.rombelIds.map((rombelId) => rombelMap.get(rombelId)?.type).filter(Boolean));
      return types.has('utama') && types.has('peminatan');
    });

    if (rombels.some((rombel) => rombel.type === 'peminatan') && studentsUtamaPlusPeminatan.length === 0) {
      warnings.push(issue(
        'STUDENT_MEMBERSHIP_NOT_READY',
        'Belum ada siswa yang terdaftar sekaligus pada rombel utama + peminatan. Validasi bentrok wajib vs peminatan belum bisa diberlakukan penuh.'
      ));
    }
  }

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

  // Batas ini dipatok sebagai hard constraint agar konsisten lintas modul.
  void constraints;
  const maxTeacherDailyHours = resolveMaxTeacherDailyHours();
  const totalEffectiveDays = new Set(timeSlots.map((slot) => slot.dayOfWeek)).size;
  if (maxTeacherDailyHours > 0 && totalEffectiveDays > 0) {
    const maxTeacherWeeklyHours = maxTeacherDailyHours * totalEffectiveDays;
    capacity.summary.teacherLoads
      .filter((entry) => entry.totalHours > maxTeacherWeeklyHours)
      .forEach((entry) => {
        errors.push(issue(
          'TEACHER_DAILY_LIMIT_INFEASIBLE',
          `Guru ${entry.name || entry.id} membutuhkan ${entry.totalHours} jam, melebihi kapasitas ${maxTeacherWeeklyHours} jam untuk batas ${maxTeacherDailyHours} jam/hari`
        ));
      });
  }

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
        teacherPreferences: teacherPreferences.length,
        studentEnrollments: studentEnrollments.length
      },
      constraints: {
        maxTeacherDailyHours,
        rombelDailySubjectSoftLimit: FIXED_ROMBEL_DAILY_SUBJECT_LIMIT,
        wajibPeminatanConflictCheckEnabled: ENABLE_WAJIB_PEMINATAN_CONFLICT_CHECK,
        totalEffectiveDays
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
      teacherPreferences,
      studentEnrollments
    }
  };
};

module.exports = {
  validateScheduleGenerationData
};
