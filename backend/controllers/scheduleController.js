const { Op } = require('sequelize');
const {
  sequelize,
  Schedule,
  TimeSlot,
  TeachingAssignment,
  Subject,
  Tendik,
  Rombel,
  AcademicPeriod
} = require('../models');

const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const buildPayload = (assignments, timeSlots) => {
  return {
    teaching_assignments: assignments.map((item) => ({
      id: item.id,
      teacher_id: item.teacherId,
      subject_id: item.subjectId,
      rombel_id: item.rombelId,
      period_id: item.periodId,
      weekly_hours: item.weeklyHours
    })),
    time_slots: timeSlots.map((slot) => ({
      id: slot.id,
      period_id: slot.periodId,
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      label: slot.label
    }))
  };
};

const normalizeScheduleItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    rombelId: item.rombelId ?? item.rombel_id,
    timeSlotId: item.timeSlotId ?? item.time_slot_id,
    teachingAssignmentId: item.teachingAssignmentId ?? item.teaching_assignment_id,
    room: item.room || null
  })).filter((item) => item.rombelId && item.timeSlotId && item.teachingAssignmentId);
};

const fallbackGenerate = (assignments, timeSlots) => {
  const slotsByRombel = new Map();
  const orderedSlots = [...timeSlots].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  assignments.forEach((assignment) => {
    if (!slotsByRombel.has(assignment.rombelId)) {
      slotsByRombel.set(assignment.rombelId, []);
    }
    const list = slotsByRombel.get(assignment.rombelId);
    const hours = assignment.weeklyHours || 1;
    for (let i = 0; i < hours; i += 1) {
      const slotIndex = list.length % orderedSlots.length;
      const slot = orderedSlots[slotIndex];
      if (!slot) break;
      list.push({
        rombelId: assignment.rombelId,
        timeSlotId: slot.id,
        teachingAssignmentId: assignment.id,
        room: null
      });
    }
  });

  return Array.from(slotsByRombel.values()).flat();
};

const list = async (req, res) => {
  const { periodId, rombelId } = req.query;
  const where = {};
  if (periodId) {
    where.periodId = periodId;
  }
  if (rombelId) {
    where.rombelId = rombelId;
  }

  const schedules = await Schedule.findAll({
    where,
    include: [
      { model: TimeSlot },
      {
        model: TeachingAssignment,
        include: [
          { model: Subject },
          { model: Tendik },
          { model: Rombel },
          { model: AcademicPeriod }
        ]
      }
    ],
    order: [
      [{ model: TeachingAssignment }, { model: Rombel }, 'name', 'ASC'],
      [{ model: TimeSlot }, 'dayOfWeek', 'ASC'],
      [{ model: TimeSlot }, 'startTime', 'ASC']
    ]
  });

  const payload = schedules.map((item) => ({
    id: item.id,
    periodId: item.periodId,
    rombelId: item.rombelId,
    timeSlot: {
      id: item.TimeSlot?.id,
      dayOfWeek: item.TimeSlot?.dayOfWeek,
      startTime: item.TimeSlot?.startTime,
      endTime: item.TimeSlot?.endTime,
      label: item.TimeSlot?.label
    },
    teachingAssignment: {
      id: item.TeachingAssignment?.id,
      weeklyHours: item.TeachingAssignment?.weeklyHours,
      subject: item.TeachingAssignment?.Subject,
      teacher: item.TeachingAssignment?.Tendik,
      rombel: item.TeachingAssignment?.Rombel,
      period: item.TeachingAssignment?.AcademicPeriod
    },
    room: item.room
  }));

  return res.json(payload);
};

const generate = async (req, res) => {
  const { periodId, constraints } = req.body;
  if (!periodId) {
    return res.status(400).json({ message: 'Periode wajib diisi' });
  }

  const [assignments, timeSlots] = await Promise.all([
    TeachingAssignment.findAll({ where: { periodId } }),
    TimeSlot.findAll({ where: { periodId } })
  ]);

  if (!assignments.length || !timeSlots.length) {
    return res.status(400).json({ message: 'Data pengampu atau jam pelajaran belum lengkap' });
  }

  let scheduleItems = [];
  const schedulerUrl = process.env.SCHEDULER_URL || 'http://localhost:8000';

  try {
    const payload = {
      period_id: Number(periodId),
      ...buildPayload(assignments, timeSlots),
      constraints: constraints || {}
    };

    const response = await fetch(`${schedulerUrl}/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      scheduleItems = normalizeScheduleItems(data.schedule);
    }
  } catch (err) {
    scheduleItems = [];
  }

  if (!scheduleItems.length) {
    scheduleItems = fallbackGenerate(assignments, timeSlots);
  }

  if (!scheduleItems.length) {
    return res.status(400).json({ message: 'Gagal membuat jadwal' });
  }

  const transaction = await sequelize.transaction();
  try {
    await Schedule.destroy({ where: { periodId }, transaction });
    await Schedule.bulkCreate(
      scheduleItems.map((item) => ({
        periodId,
        rombelId: item.rombelId,
        timeSlotId: item.timeSlotId,
        teachingAssignmentId: item.teachingAssignmentId,
        room: item.room || null
      })),
      { transaction }
    );

    await transaction.commit();

    return res.json({
      message: 'Jadwal berhasil digenerate',
      total: scheduleItems.length,
      engine: scheduleItems.length ? 'hybrid-cpsat-ga (fallback if needed)' : 'none'
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal menyimpan jadwal' });
  }
};

module.exports = {
  list,
  generate
};
