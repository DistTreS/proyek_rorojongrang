const { Op } = require('sequelize');
const { TimeSlot, AcademicPeriod, Schedule, Attendance } = require('../models');
const { serviceError } = require('../utils/serviceError');
const {
  buildTimeOverlapWhere,
  ensureAcademicPeriod,
  ensureDayOfWeek,
  ensureTimeRange,
  normalizeNullableText,
  normalizeTimeString
} = require('./schedulingSupport');

const formatTimeSlot = (slot) => ({
  id: slot.id,
  periodId: slot.periodId,
  periodName: slot.AcademicPeriod?.name || null,
  dayOfWeek: slot.dayOfWeek,
  startTime: slot.startTime,
  endTime: slot.endTime,
  label: slot.label
});

const ensureNoTimeSlotConflict = async ({ periodId, dayOfWeek, startTime, endTime }, { excludeId } = {}) => {
  const where = {
    periodId,
    dayOfWeek,
    ...buildTimeOverlapWhere(startTime, endTime)
  };
  if (excludeId) {
    where.id = { [Op.ne]: excludeId };
  }

  const overlap = await TimeSlot.findOne({ where });
  if (overlap) {
    throw serviceError(409, 'Jam pelajaran bentrok dengan slot lain pada hari dan periode yang sama');
  }
};

const validateTimeSlotInput = async ({ periodId, dayOfWeek, startTime, endTime, label }, { excludeId } = {}) => {
  const period = await ensureAcademicPeriod(periodId);
  const normalizedDayOfWeek = ensureDayOfWeek(dayOfWeek);
  const normalizedStartTime = normalizeTimeString(startTime, 'Jam mulai');
  const normalizedEndTime = normalizeTimeString(endTime, 'Jam selesai');
  ensureTimeRange(normalizedStartTime, normalizedEndTime);
  await ensureNoTimeSlotConflict({
    periodId: period.id,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime
  }, { excludeId });

  return {
    period,
    dayOfWeek: normalizedDayOfWeek,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    label: normalizeNullableText(label)
  };
};

const listTimeSlots = async ({ periodId } = {}) => {
  const where = {};
  if (periodId) {
    where.periodId = Number(periodId);
  }

  const slots = await TimeSlot.findAll({
    where,
    include: [{ model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }],
    order: [['periodId', 'DESC'], ['dayOfWeek', 'ASC'], ['startTime', 'ASC']]
  });

  return slots.map(formatTimeSlot);
};

const getTimeSlotDetail = async (id) => {
  const slot = await TimeSlot.findByPk(id, {
    include: [{ model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }]
  });

  if (!slot) {
    throw serviceError(404, 'Jam pelajaran tidak ditemukan');
  }

  return formatTimeSlot(slot);
};

const createTimeSlot = async (payload) => {
  const validated = await validateTimeSlotInput(payload);
  const slot = await TimeSlot.create({
    periodId: validated.period.id,
    dayOfWeek: validated.dayOfWeek,
    startTime: validated.startTime,
    endTime: validated.endTime,
    label: validated.label
  });

  return {
    id: slot.id,
    periodId: slot.periodId,
    periodName: validated.period.name,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  };
};

const updateTimeSlot = async (id, payload) => {
  const slot = await TimeSlot.findByPk(id);
  if (!slot) {
    throw serviceError(404, 'Jam pelajaran tidak ditemukan');
  }

  const nextPayload = {
    periodId: payload.periodId !== undefined ? payload.periodId : slot.periodId,
    dayOfWeek: payload.dayOfWeek !== undefined ? payload.dayOfWeek : slot.dayOfWeek,
    startTime: payload.startTime !== undefined ? payload.startTime : slot.startTime,
    endTime: payload.endTime !== undefined ? payload.endTime : slot.endTime,
    label: payload.label !== undefined ? payload.label : slot.label
  };

  const validated = await validateTimeSlotInput(nextPayload, { excludeId: slot.id });
  slot.periodId = validated.period.id;
  slot.dayOfWeek = validated.dayOfWeek;
  slot.startTime = validated.startTime;
  slot.endTime = validated.endTime;
  slot.label = validated.label;
  await slot.save();

  return {
    id: slot.id,
    periodId: slot.periodId,
    periodName: validated.period.name,
    dayOfWeek: slot.dayOfWeek,
    startTime: slot.startTime,
    endTime: slot.endTime,
    label: slot.label
  };
};

const deleteTimeSlot = async (id) => {
  const slot = await TimeSlot.findByPk(id);
  if (!slot) {
    throw serviceError(404, 'Jam pelajaran tidak ditemukan');
  }

  const [scheduleCount, attendanceCount] = await Promise.all([
    Schedule.count({ where: { timeSlotId: id } }),
    Attendance.count({ where: { timeSlotId: id } })
  ]);

  if (scheduleCount > 0 || attendanceCount > 0) {
    throw serviceError(409, 'Jam pelajaran tidak bisa dihapus karena sudah dipakai pada jadwal atau presensi');
  }

  await slot.destroy();
  return { message: 'Jam pelajaran dihapus' };
};

module.exports = {
  createTimeSlot,
  deleteTimeSlot,
  getTimeSlotDetail,
  listTimeSlots,
  updateTimeSlot
};
