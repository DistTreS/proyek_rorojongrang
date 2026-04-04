const { Op } = require('sequelize');
const {
  TeachingAssignment,
  Tendik,
  Subject,
  Rombel,
  AcademicPeriod,
  Schedule
} = require('../models');
const { serviceError } = require('../utils/serviceError');
const {
  ensureAcademicPeriod,
  ensureGuruTendik,
  formatPeriodSummary,
  formatTeacherSummary,
  parseInteger,
  parsePositiveInteger
} = require('./schedulingSupport');
const { paginateItems, parsePagination } = require('../utils/pagination');

const assignmentInclude = [
  {
    model: Tendik,
    attributes: ['id', 'name', 'nip', 'position'],
    include: []
  },
  { model: Subject, attributes: ['id', 'code', 'name', 'type', 'periodId'] },
  { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'type', 'periodId'] },
  { model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }
];

const formatAssignment = (assignment) => ({
  id: assignment.id,
  teacherId: assignment.teacherId,
  subjectId: assignment.subjectId,
  rombelId: assignment.rombelId,
  periodId: assignment.periodId,
  weeklyHours: assignment.weeklyHours,
  teacher: assignment.Tendik
    ? {
      id: assignment.Tendik.id,
      name: assignment.Tendik.name,
      nip: assignment.Tendik.nip,
      position: assignment.Tendik.position
    }
    : null,
  subject: assignment.Subject
    ? {
      id: assignment.Subject.id,
      code: assignment.Subject.code,
      name: assignment.Subject.name,
      type: assignment.Subject.type,
      periodId: assignment.Subject.periodId
    }
    : null,
  rombel: assignment.Rombel
    ? {
      id: assignment.Rombel.id,
      name: assignment.Rombel.name,
      gradeLevel: assignment.Rombel.gradeLevel,
      type: assignment.Rombel.type,
      periodId: assignment.Rombel.periodId
    }
    : null,
  period: formatPeriodSummary(assignment.AcademicPeriod)
});

const ensureAssignmentRelations = async ({ teacherId, subjectId, rombelId, periodId, weeklyHours }, { excludeId } = {}) => {
  const normalizedTeacherId = parseInteger(teacherId, 'Guru');
  const normalizedSubjectId = parseInteger(subjectId, 'Mata pelajaran');
  const normalizedRombelId = parseInteger(rombelId, 'Rombel');
  const normalizedWeeklyHours = parsePositiveInteger(weeklyHours, 'Jam mingguan');

  const [teacher, subject, rombel, period] = await Promise.all([
    ensureGuruTendik(normalizedTeacherId),
    Subject.findByPk(normalizedSubjectId),
    Rombel.findByPk(normalizedRombelId),
    ensureAcademicPeriod(periodId)
  ]);

  if (!subject) {
    throw serviceError(400, 'Mata pelajaran tidak valid');
  }
  if (!rombel) {
    throw serviceError(400, 'Rombel tidak valid');
  }
  if (subject.periodId !== period.id) {
    throw serviceError(400, 'Mapel tidak sesuai dengan periode akademik yang dipilih');
  }
  if (rombel.periodId !== period.id) {
    throw serviceError(400, 'Rombel tidak sesuai dengan periode akademik yang dipilih');
  }
  if (subject.type === 'wajib' && rombel.type !== 'utama') {
    throw serviceError(400, 'Mapel wajib hanya dapat dihubungkan ke rombel utama');
  }
  if (subject.type === 'peminatan' && rombel.type !== 'peminatan') {
    throw serviceError(400, 'Mapel peminatan hanya dapat dihubungkan ke rombel peminatan');
  }

  const duplicateWhere = {
    periodId: period.id,
    subjectId: subject.id,
    rombelId: rombel.id
  };
  if (excludeId) {
    duplicateWhere.id = { [Op.ne]: excludeId };
  }

  const duplicate = await TeachingAssignment.findOne({ where: duplicateWhere });
  if (duplicate) {
    throw serviceError(409, 'Pengampu untuk mapel dan rombel tersebut sudah ada pada periode ini');
  }

  return {
    teacher,
    subject,
    rombel,
    period,
    weeklyHours: normalizedWeeklyHours
  };
};

const listTeachingAssignments = async (query = {}) => {
  const pagination = parsePagination(query);
  const { periodId } = query;
  const where = {};
  if (periodId) {
    where.periodId = Number(periodId);
  }

  const assignments = await TeachingAssignment.findAll({
    where,
    include: assignmentInclude,
    order: [['periodId', 'DESC'], ['id', 'DESC']]
  });

  return paginateItems(assignments.map(formatAssignment), pagination);
};

const getTeachingAssignmentDetail = async (id) => {
  const assignment = await TeachingAssignment.findByPk(id, {
    include: assignmentInclude
  });

  if (!assignment) {
    throw serviceError(404, 'Pengampu mapel tidak ditemukan');
  }

  return formatAssignment(assignment);
};

const createTeachingAssignment = async (payload) => {
  const validated = await ensureAssignmentRelations(payload);
  const assignment = await TeachingAssignment.create({
    teacherId: validated.teacher.id,
    subjectId: validated.subject.id,
    rombelId: validated.rombel.id,
    periodId: validated.period.id,
    weeklyHours: validated.weeklyHours
  });

  return {
    id: assignment.id,
    teacherId: assignment.teacherId,
    subjectId: assignment.subjectId,
    rombelId: assignment.rombelId,
    periodId: assignment.periodId,
    weeklyHours: assignment.weeklyHours,
    teacher: formatTeacherSummary(validated.teacher),
    subject: {
      id: validated.subject.id,
      code: validated.subject.code,
      name: validated.subject.name,
      type: validated.subject.type,
      periodId: validated.subject.periodId
    },
    rombel: {
      id: validated.rombel.id,
      name: validated.rombel.name,
      gradeLevel: validated.rombel.gradeLevel,
      type: validated.rombel.type,
      periodId: validated.rombel.periodId
    },
    period: formatPeriodSummary(validated.period)
  };
};

const updateTeachingAssignment = async (id, payload) => {
  const assignment = await TeachingAssignment.findByPk(id);
  if (!assignment) {
    throw serviceError(404, 'Pengampu mapel tidak ditemukan');
  }

  const nextPayload = {
    teacherId: payload.teacherId !== undefined ? payload.teacherId : assignment.teacherId,
    subjectId: payload.subjectId !== undefined ? payload.subjectId : assignment.subjectId,
    rombelId: payload.rombelId !== undefined ? payload.rombelId : assignment.rombelId,
    periodId: payload.periodId !== undefined ? payload.periodId : assignment.periodId,
    weeklyHours: payload.weeklyHours !== undefined ? payload.weeklyHours : assignment.weeklyHours
  };

  const validated = await ensureAssignmentRelations(nextPayload, { excludeId: assignment.id });
  assignment.teacherId = validated.teacher.id;
  assignment.subjectId = validated.subject.id;
  assignment.rombelId = validated.rombel.id;
  assignment.periodId = validated.period.id;
  assignment.weeklyHours = validated.weeklyHours;
  await assignment.save();

  return {
    id: assignment.id,
    teacherId: assignment.teacherId,
    subjectId: assignment.subjectId,
    rombelId: assignment.rombelId,
    periodId: assignment.periodId,
    weeklyHours: assignment.weeklyHours,
    teacher: formatTeacherSummary(validated.teacher),
    subject: {
      id: validated.subject.id,
      code: validated.subject.code,
      name: validated.subject.name,
      type: validated.subject.type,
      periodId: validated.subject.periodId
    },
    rombel: {
      id: validated.rombel.id,
      name: validated.rombel.name,
      gradeLevel: validated.rombel.gradeLevel,
      type: validated.rombel.type,
      periodId: validated.rombel.periodId
    },
    period: formatPeriodSummary(validated.period)
  };
};

const deleteTeachingAssignment = async (id) => {
  const assignment = await TeachingAssignment.findByPk(id);
  if (!assignment) {
    throw serviceError(404, 'Pengampu mapel tidak ditemukan');
  }

  const scheduleCount = await Schedule.count({ where: { teachingAssignmentId: id } });
  if (scheduleCount > 0) {
    throw serviceError(409, 'Pengampu tidak bisa dihapus karena sudah dipakai pada jadwal');
  }

  await assignment.destroy();
  return { message: 'Pengampu mapel dihapus' };
};

module.exports = {
  createTeachingAssignment,
  deleteTeachingAssignment,
  getTeachingAssignmentDetail,
  listTeachingAssignments,
  updateTeachingAssignment
};
