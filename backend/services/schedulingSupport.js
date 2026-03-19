const { Op } = require('sequelize');
const { AcademicPeriod, Tendik, User, Role } = require('../models');
const { ROLES, getUserRoles } = require('../config/rbac');
const { serviceError } = require('../utils/serviceError');

const ROMBEL_TYPES = Object.freeze(['utama', 'peminatan']);
const SUBJECT_TYPES = Object.freeze(['wajib', 'peminatan']);
const PREFERENCE_TYPES = Object.freeze(['prefer', 'avoid']);

const normalizeText = (value) => String(value || '').trim();

const normalizeNullableText = (value) => {
  const normalized = normalizeText(value);
  return normalized || null;
};

const normalizeEnumValue = (value, allowedValues, fieldLabel, fallbackValue = null) => {
  if ((value === undefined || value === null || value === '') && fallbackValue !== null) {
    return fallbackValue;
  }

  const normalized = normalizeText(value).toLowerCase();
  if (!allowedValues.includes(normalized)) {
    throw serviceError(400, `${fieldLabel} tidak valid`);
  }

  return normalized;
};

const parseInteger = (value, fieldLabel) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw serviceError(400, `${fieldLabel} tidak valid`);
  }
  return parsed;
};

const parsePositiveInteger = (value, fieldLabel) => {
  const parsed = parseInteger(value, fieldLabel);
  if (parsed <= 0) {
    throw serviceError(400, `${fieldLabel} harus lebih dari 0`);
  }
  return parsed;
};

const normalizeTimeString = (value, fieldLabel) => {
  const normalized = normalizeText(value);
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) {
    throw serviceError(400, `${fieldLabel} tidak valid`);
  }

  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
};

const ensureTimeRange = (startTime, endTime) => {
  if (startTime >= endTime) {
    throw serviceError(400, 'Jam selesai harus setelah jam mulai');
  }
};

const ensureDayOfWeek = (value) => {
  const dayOfWeek = parseInteger(value, 'Hari');
  if (dayOfWeek < 1 || dayOfWeek > 6) {
    throw serviceError(400, 'Hari tidak valid');
  }
  return dayOfWeek;
};

const ensureAcademicPeriod = async (periodId) => {
  const normalizedPeriodId = parseInteger(periodId, 'Periode akademik');
  const period = await AcademicPeriod.findByPk(normalizedPeriodId);
  if (!period) {
    throw serviceError(400, 'Periode akademik tidak valid');
  }
  return period;
};

const ensureGuruTendik = async (teacherId) => {
  const normalizedTeacherId = parseInteger(teacherId, 'Guru');
  const teacher = await Tendik.findByPk(normalizedTeacherId, {
    include: [
      {
        model: User,
        attributes: ['id', 'username', 'email', 'isActive'],
        include: [{ model: Role, attributes: ['id', 'name'] }]
      }
    ]
  });

  if (!teacher) {
    throw serviceError(400, 'Guru tidak valid');
  }

  const roles = getUserRoles(teacher.User);
  if (!roles.includes(ROLES.GURU)) {
    throw serviceError(400, 'Tendik yang dipilih tidak memiliki role guru');
  }

  return teacher;
};

const formatPeriodSummary = (period) => {
  if (!period) return null;
  return {
    id: period.id,
    name: period.name,
    semester: period.semester,
    isActive: period.isActive
  };
};

const formatTeacherSummary = (teacher) => {
  if (!teacher) return null;

  return {
    id: teacher.id,
    name: teacher.name,
    nip: teacher.nip,
    position: teacher.position,
    roles: getUserRoles(teacher.User)
  };
};

const buildTimeOverlapWhere = (startTime, endTime) => ({
  startTime: { [Op.lt]: endTime },
  endTime: { [Op.gt]: startTime }
});

module.exports = {
  PREFERENCE_TYPES,
  ROMBEL_TYPES,
  SUBJECT_TYPES,
  buildTimeOverlapWhere,
  ensureAcademicPeriod,
  ensureDayOfWeek,
  ensureGuruTendik,
  ensureTimeRange,
  formatPeriodSummary,
  formatTeacherSummary,
  normalizeEnumValue,
  normalizeNullableText,
  normalizeText,
  normalizeTimeString,
  parseInteger,
  parsePositiveInteger
};
