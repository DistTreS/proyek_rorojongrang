const { Op } = require('sequelize');
const { Schedule, ScheduleBatch, TimeSlot, TeachingAssignment, Subject, Tendik, Rombel } = require('../models');

const createEmptyBatchSummary = () => ({
  totalSlots: 0,
  totalRombels: 0,
  totalTeachers: 0,
  totalSubjects: 0,
  totalConflicts: 0,
  conflicts: {
    teacherSlot: 0,
    rombelSlot: 0,
    invalidPeriod: 0
  }
});

const collectBatchSummaries = async (batchIds, { teacherId } = {}) => {
  const normalizedBatchIds = [...new Set((batchIds || []).map((id) => Number(id)).filter(Boolean))];
  const summaryMap = new Map();
  normalizedBatchIds.forEach((batchId) => {
    summaryMap.set(batchId, createEmptyBatchSummary());
  });

  if (!normalizedBatchIds.length) {
    return summaryMap;
  }

  const schedules = await Schedule.findAll({
    where: { batchId: { [Op.in]: normalizedBatchIds } },
    include: [
      { model: ScheduleBatch, attributes: ['id', 'periodId'] },
      { model: TimeSlot, attributes: ['id', 'periodId'] },
      {
        model: TeachingAssignment,
        attributes: ['id', 'teacherId', 'subjectId', 'rombelId', 'periodId'],
        where: teacherId ? { teacherId } : undefined,
        required: Boolean(teacherId),
        include: [
          { model: Subject, attributes: ['id', 'periodId'] },
          { model: Rombel, attributes: ['id', 'periodId'] },
          { model: Tendik, attributes: ['id'] }
        ]
      }
    ],
    order: [['batchId', 'ASC']]
  });

  const working = new Map();
  normalizedBatchIds.forEach((batchId) => {
    working.set(batchId, {
      summary: createEmptyBatchSummary(),
      rombels: new Set(),
      teachers: new Set(),
      subjects: new Set(),
      teacherSlotCounts: new Map(),
      rombelSlotCounts: new Map()
    });
  });

  schedules.forEach((item) => {
    const batchId = Number(item.batchId);
    const state = working.get(batchId);
    if (!state) return;

    const summary = state.summary;
    summary.totalSlots += 1;

    const assignment = item.TeachingAssignment;
    if (assignment?.rombelId) state.rombels.add(Number(assignment.rombelId));
    if (assignment?.teacherId) state.teachers.add(Number(assignment.teacherId));
    if (assignment?.subjectId) state.subjects.add(Number(assignment.subjectId));

    if (assignment?.teacherId && item.timeSlotId) {
      const key = `${assignment.teacherId}-${item.timeSlotId}`;
      state.teacherSlotCounts.set(key, (state.teacherSlotCounts.get(key) || 0) + 1);
    }
    if (assignment?.rombelId && item.timeSlotId) {
      const key = `${assignment.rombelId}-${item.timeSlotId}`;
      state.rombelSlotCounts.set(key, (state.rombelSlotCounts.get(key) || 0) + 1);
    }

    const batchPeriodId = item.ScheduleBatch?.periodId;
    const invalidPeriod = (
      item.periodId !== batchPeriodId
      || item.TimeSlot?.periodId !== batchPeriodId
      || assignment?.periodId !== batchPeriodId
      || assignment?.Subject?.periodId !== batchPeriodId
      || assignment?.Rombel?.periodId !== batchPeriodId
    );

    if (invalidPeriod) {
      summary.conflicts.invalidPeriod += 1;
    }
  });

  working.forEach((state, batchId) => {
    state.summary.totalRombels = state.rombels.size;
    state.summary.totalTeachers = state.teachers.size;
    state.summary.totalSubjects = state.subjects.size;

    state.teacherSlotCounts.forEach((count) => {
      if (count > 1) state.summary.conflicts.teacherSlot += count - 1;
    });
    state.rombelSlotCounts.forEach((count) => {
      if (count > 1) state.summary.conflicts.rombelSlot += count - 1;
    });

    state.summary.totalConflicts = (
      state.summary.conflicts.teacherSlot
      + state.summary.conflicts.rombelSlot
      + state.summary.conflicts.invalidPeriod
    );

    summaryMap.set(batchId, state.summary);
  });

  return summaryMap;
};

module.exports = {
  collectBatchSummaries,
  createEmptyBatchSummary
};
