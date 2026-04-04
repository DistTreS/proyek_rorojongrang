const { Op } = require('sequelize');
const { TeacherPreference, AcademicPeriod, Tendik } = require('../models');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');
const {
  PREFERENCE_TYPES,
  buildTimeOverlapWhere,
  ensureAcademicPeriod,
  ensureDayOfWeek,
  ensureGuruTendik,
  formatPeriodSummary,
  formatTeacherSummary,
  normalizeEnumValue,
  normalizeNullableText,
  normalizeTimeString,
  parseInteger
} = require('./schedulingSupport');

const preferenceInclude = [
  { model: Tendik, as: 'Teacher', attributes: ['id', 'name', 'nip', 'position'] },
  { model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }
];

const formatTeacherPreference = (preference) => ({
  id: preference.id,
  teacherId: preference.teacherId,
  periodId: preference.periodId,
  dayOfWeek: preference.dayOfWeek,
  startTime: preference.startTime,
  endTime: preference.endTime,
  preferenceType: preference.preferenceType,
  notes: preference.notes,
  teacher: preference.Teacher
    ? {
      id: preference.Teacher.id,
      name: preference.Teacher.name,
      nip: preference.Teacher.nip,
      position: preference.Teacher.position
    }
    : null,
  period: formatPeriodSummary(preference.AcademicPeriod)
});

const ensureNoPreferenceConflict = async ({ teacherId, periodId, dayOfWeek, startTime, endTime }, { excludeId } = {}) => {
  const where = {
    teacherId,
    periodId,
    dayOfWeek,
    ...buildTimeOverlapWhere(startTime, endTime)
  };
  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }

  const overlap = await TeacherPreference.findOne({ where });
  if (overlap) {
    throw serviceError(409, 'Preferensi guru bentrok dengan preferensi lain pada hari dan periode yang sama');
  }
};

const validateTeacherPreferenceInput = async (
  { teacherId, periodId, dayOfWeek, startTime, endTime, preferenceType, notes },
  { excludeId } = {}
) => {
  const normalizedTeacherId = parseInteger(teacherId, 'Guru');
  const normalizedStartTime = normalizeTimeString(startTime, 'Jam mulai');
  const normalizedEndTime = normalizeTimeString(endTime, 'Jam selesai');
  if (normalizedStartTime >= normalizedEndTime) {
    throw serviceError(400, 'Jam selesai harus setelah jam mulai');
  }

  const [teacher, period] = await Promise.all([
    ensureGuruTendik(normalizedTeacherId),
    ensureAcademicPeriod(periodId)
  ]);

  const normalizedDayOfWeek = ensureDayOfWeek(dayOfWeek);
  const normalizedPreferenceType = normalizeEnumValue(
    preferenceType,
    PREFERENCE_TYPES,
    'Jenis preferensi',
    'avoid'
  );

  await ensureNoPreferenceConflict({
    teacherId: teacher.id,
    periodId: period.id,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime
  }, { excludeId });

  return {
    teacher,
    period,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    preferenceType: normalizedPreferenceType,
    notes: normalizeNullableText(notes)
  };
};

const listTeacherPreferences = async (query = {}) => {
  const pagination = parsePagination(query);
  const { periodId, teacherId, preferenceType } = query;
  const where = {};
  if (periodId) where.periodId = Number(periodId);
  if (teacherId) where.teacherId = Number(teacherId);
  if (preferenceType) where.preferenceType = String(preferenceType).toLowerCase();

  const preferences = await TeacherPreference.findAll({
    where,
    include: preferenceInclude,
    order: [['periodId', 'DESC'], ['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
  });

  return paginateItems(preferences.map(formatTeacherPreference), pagination);
};

const getTeacherPreferenceDetail = async (id) => {
  const preference = await TeacherPreference.findByPk(id, {
    include: preferenceInclude
  });

  if (!preference) {
    throw serviceError(404, 'Preferensi guru tidak ditemukan');
  }

  return formatTeacherPreference(preference);
};

const createTeacherPreference = async (payload) => {
  const validated = await validateTeacherPreferenceInput(payload);
  const preference = await TeacherPreference.create({
    teacherId: validated.teacher.id,
    periodId: validated.period.id,
    dayOfWeek: validated.dayOfWeek,
    startTime: validated.startTime,
    endTime: validated.endTime,
    preferenceType: validated.preferenceType,
    notes: validated.notes
  });

  return {
    id: preference.id,
    teacherId: preference.teacherId,
    periodId: preference.periodId,
    dayOfWeek: preference.dayOfWeek,
    startTime: preference.startTime,
    endTime: preference.endTime,
    preferenceType: preference.preferenceType,
    notes: preference.notes,
    teacher: formatTeacherSummary(validated.teacher),
    period: formatPeriodSummary(validated.period)
  };
};

const updateTeacherPreference = async (id, payload) => {
  const preference = await TeacherPreference.findByPk(id);
  if (!preference) {
    throw serviceError(404, 'Preferensi guru tidak ditemukan');
  }

  const nextPayload = {
    teacherId: payload.teacherId !== undefined ? payload.teacherId : preference.teacherId,
    periodId: payload.periodId !== undefined ? payload.periodId : preference.periodId,
    dayOfWeek: payload.dayOfWeek !== undefined ? payload.dayOfWeek : preference.dayOfWeek,
    startTime: payload.startTime !== undefined ? payload.startTime : preference.startTime,
    endTime: payload.endTime !== undefined ? payload.endTime : preference.endTime,
    preferenceType: payload.preferenceType !== undefined ? payload.preferenceType : preference.preferenceType,
    notes: payload.notes !== undefined ? payload.notes : preference.notes
  };

  const validated = await validateTeacherPreferenceInput(nextPayload, { excludeId: preference.id });
  preference.teacherId = validated.teacher.id;
  preference.periodId = validated.period.id;
  preference.dayOfWeek = validated.dayOfWeek;
  preference.startTime = validated.startTime;
  preference.endTime = validated.endTime;
  preference.preferenceType = validated.preferenceType;
  preference.notes = validated.notes;
  await preference.save();

  return {
    id: preference.id,
    teacherId: preference.teacherId,
    periodId: preference.periodId,
    dayOfWeek: preference.dayOfWeek,
    startTime: preference.startTime,
    endTime: preference.endTime,
    preferenceType: preference.preferenceType,
    notes: preference.notes,
    teacher: formatTeacherSummary(validated.teacher),
    period: formatPeriodSummary(validated.period)
  };
};

const deleteTeacherPreference = async (id) => {
  const preference = await TeacherPreference.findByPk(id);
  if (!preference) {
    throw serviceError(404, 'Preferensi guru tidak ditemukan');
  }

  await preference.destroy();
  return { message: 'Preferensi guru dihapus' };
};

module.exports = {
  createTeacherPreference,
  deleteTeacherPreference,
  getTeacherPreferenceDetail,
  listTeacherPreferences,
  updateTeacherPreference
};
