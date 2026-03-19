const {
  sequelize,
  Schedule,
  ScheduleBatch,
  ScheduleBatchLog,
  TimeSlot,
  TeachingAssignment,
  Subject,
  Tendik,
  Rombel,
  AcademicPeriod,
  User
} = require('../models');
const { serviceError } = require('../utils/serviceError');
const { validateScheduleGenerationData } = require('./scheduleValidationService');
const { getTeacherContext, isGuruUser } = require('./teacherOperationalService');
const { generateScheduleItems } = require('./schedulerClient');
const { collectBatchSummaries, createEmptyBatchSummary } = require('./scheduleBatchSummaryService');
const {
  BATCH_STATUSES,
  ensureBatchEditable,
  ensureDraftConflictFree,
  ensurePeriodId,
  ensureStatus,
  resolveTargetTeachingAssignment,
  resolveTargetTimeSlot
} = require('../validators/scheduleWorkflowValidator');

const scheduleInclude = [
  {
    model: ScheduleBatch,
    include: [
      { model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] },
      { model: User, as: 'Submitter', attributes: ['id', 'username'], required: false },
      { model: User, as: 'Approver', attributes: ['id', 'username'], required: false }
    ]
  },
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
];

const formatBatch = (batch, scheduleCount = 0, summary = null) => ({
  id: batch.id,
  periodId: batch.periodId,
  periodName: batch.AcademicPeriod?.name || null,
  versionNumber: batch.versionNumber,
  status: batch.status,
  submittedBy: batch.submittedBy,
  submittedByUsername: batch.Submitter?.username || null,
  approvedBy: batch.approvedBy,
  approvedByUsername: batch.Approver?.username || null,
  submittedAt: batch.submittedAt,
  approvedAt: batch.approvedAt,
  notes: batch.notes,
  createdAt: batch.createdAt,
  updatedAt: batch.updatedAt,
  scheduleCount,
  summary,
  logs: (batch.ScheduleBatchLogs || []).map((log) => ({
    id: log.id,
    actorId: log.actorId,
    actorUsername: log.Actor?.username || null,
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    notes: log.notes,
    createdAt: log.createdAt
  }))
});

const formatScheduleItem = (item) => ({
  id: item.id,
  batchId: item.batchId,
  periodId: item.periodId,
  rombelId: item.rombelId,
  batch: item.ScheduleBatch
    ? {
      id: item.ScheduleBatch.id,
      periodId: item.ScheduleBatch.periodId,
      periodName: item.ScheduleBatch.AcademicPeriod?.name || null,
      versionNumber: item.ScheduleBatch.versionNumber,
      status: item.ScheduleBatch.status,
      submittedAt: item.ScheduleBatch.submittedAt,
      approvedAt: item.ScheduleBatch.approvedAt,
      notes: item.ScheduleBatch.notes
    }
    : null,
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
});

const getNextVersionNumber = async (periodId, transaction) => {
  const latest = await ScheduleBatch.findOne({
    where: { periodId },
    order: [['versionNumber', 'DESC']],
    transaction
  });
  return (latest?.versionNumber || 0) + 1;
};

const listScheduleBatches = async ({ periodId, status, user } = {}) => {
  const where = {};
  if (periodId) where.periodId = ensurePeriodId(periodId);
  const teacher = await getTeacherContext(user);
  const normalizedStatus = ensureStatus(isGuruUser(user) ? 'approved' : status);
  if (normalizedStatus) where.status = normalizedStatus;

  const include = [
    { model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] },
    { model: User, as: 'Submitter', attributes: ['id', 'username'], required: false },
    { model: User, as: 'Approver', attributes: ['id', 'username'], required: false },
    {
      model: ScheduleBatchLog,
      include: [{ model: User, as: 'Actor', attributes: ['id', 'username'], required: false }],
      required: false
    }
  ];

  if (teacher) {
    include.push({
      model: Schedule,
      attributes: ['id'],
      required: true,
      include: [{
        model: TeachingAssignment,
        attributes: ['id'],
        where: { teacherId: teacher.id },
        required: true
      }]
    });
  }

  const batches = await ScheduleBatch.findAll({
    where,
    include,
    order: [['createdAt', 'DESC'], ['versionNumber', 'DESC']]
  });

  const summaryMap = await collectBatchSummaries(
    batches.map((batch) => batch.id),
    { teacherId: teacher?.id }
  );

  const counts = teacher
    ? await Schedule.findAll({
      attributes: ['batchId', [sequelize.fn('COUNT', sequelize.col('Schedule.id')), 'total']],
      include: [{
        model: TeachingAssignment,
        attributes: [],
        where: { teacherId: teacher.id },
        required: true
      }],
      group: ['batchId'],
      raw: true
    })
    : await Schedule.count({
      attributes: ['batchId', [sequelize.fn('COUNT', sequelize.col('id')), 'total']],
      group: ['batchId'],
      raw: true
    });
  const countMap = new Map(counts.map((row) => [Number(row.batchId), Number(row.total)]));

  return batches.map((batch) => (
    formatBatch(batch, countMap.get(batch.id) || 0, summaryMap.get(batch.id) || createEmptyBatchSummary())
  ));
};

const resolveDefaultBatch = async ({ periodId, status } = {}) => {
  const where = {};
  if (periodId) where.periodId = ensurePeriodId(periodId);
  const normalizedStatus = ensureStatus(status);

  if (normalizedStatus) {
    where.status = normalizedStatus;
    return ScheduleBatch.findOne({
      where,
      order: [['createdAt', 'DESC'], ['versionNumber', 'DESC']]
    });
  }

  let batch = await ScheduleBatch.findOne({
    where: { ...where, status: 'approved' },
    order: [['createdAt', 'DESC'], ['versionNumber', 'DESC']]
  });

  if (!batch) {
    batch = await ScheduleBatch.findOne({
      where,
      order: [['createdAt', 'DESC'], ['versionNumber', 'DESC']]
    });
  }

  return batch;
};

const listScheduleItems = async ({ periodId, rombelId, batchId, status, user } = {}) => {
  const where = {};
  const batchWhere = {};
  const teacher = await getTeacherContext(user);

  if (teacher) {
    batchWhere.status = 'approved';
  }

  if (rombelId) where.rombelId = Number(rombelId);

  let targetBatchId = batchId ? Number(batchId) : null;
  if (!targetBatchId && !teacher) {
    const batch = await resolveDefaultBatch({ periodId, status });
    targetBatchId = batch?.id || null;
  }

  if (targetBatchId) {
    where.batchId = targetBatchId;
  } else {
    if (periodId) batchWhere.periodId = ensurePeriodId(periodId);
    const normalizedStatus = ensureStatus(teacher ? 'approved' : status);
    if (normalizedStatus) batchWhere.status = normalizedStatus;
  }

  const schedules = await Schedule.findAll({
    where,
    include: scheduleInclude.map((entry) => (
      entry.model === ScheduleBatch
        ? { ...entry, where: Object.keys(batchWhere).length ? batchWhere : undefined }
        : entry.model === TeachingAssignment && teacher
          ? {
            ...entry,
            where: { teacherId: teacher.id }
          }
        : entry
    )),
    order: [
      [{ model: ScheduleBatch }, 'versionNumber', 'DESC'],
      [{ model: TeachingAssignment }, { model: Rombel }, 'name', 'ASC'],
      [{ model: TimeSlot }, 'dayOfWeek', 'ASC'],
      [{ model: TimeSlot }, 'startTime', 'ASC']
    ]
  });

  return schedules.map(formatScheduleItem);
};

const generateDraftScheduleBatch = async ({ periodId, constraints, userId }) => {
  const normalizedPeriodId = ensurePeriodId(periodId);
  const validation = await validateScheduleGenerationData(normalizedPeriodId);
  if (!validation.valid) {
    throw Object.assign(serviceError(422, validation.message), { validation });
  }

  const assignments = validation.data.assignments;
  const timeSlots = validation.data.timeSlots;
  const teacherPreferences = validation.data.teacherPreferences || [];
  const schedulerResult = await generateScheduleItems({
    assignments,
    timeSlots,
    periodId: normalizedPeriodId,
    constraints,
    teacherPreferences
  });
  const scheduleItems = schedulerResult.scheduleItems;

  if (!scheduleItems.length) {
    throw serviceError(400, 'Gagal membuat draft jadwal');
  }

  const transaction = await sequelize.transaction();
  try {
    const versionNumber = await getNextVersionNumber(normalizedPeriodId, transaction);
    const batch = await ScheduleBatch.create({
      periodId: normalizedPeriodId,
      versionNumber,
      status: 'draft',
      submittedBy: null,
      approvedBy: null,
      submittedAt: null,
      approvedAt: null,
      notes: userId ? `Draft hasil generate oleh user #${userId}` : 'Draft hasil generate'
    }, { transaction });

    await ScheduleBatchLog.create({
      batchId: batch.id,
      actorId: userId || null,
      fromStatus: null,
      toStatus: 'draft',
      notes: 'Batch draft dibuat dari proses generate jadwal'
    }, { transaction });

    await Schedule.bulkCreate(
      scheduleItems.map((item) => ({
        batchId: batch.id,
        periodId: normalizedPeriodId,
        rombelId: item.rombelId,
        timeSlotId: item.timeSlotId,
        teachingAssignmentId: item.teachingAssignmentId,
        room: item.room || null
      })),
      { transaction }
    );

    await transaction.commit();

    return {
      message: 'Draft jadwal berhasil digenerate',
      total: scheduleItems.length,
      engine: schedulerResult.engine,
      scheduler: {
        source: schedulerResult.source,
        generatedAt: schedulerResult.generatedAt,
        summary: schedulerResult.summary,
        warnings: schedulerResult.warnings,
        conflicts: schedulerResult.conflicts,
        fallbackReason: schedulerResult.fallbackReason,
        requestMeta: schedulerResult.requestMeta
      },
      batch: {
        id: batch.id,
        periodId: batch.periodId,
        versionNumber: batch.versionNumber,
        status: batch.status,
        notes: batch.notes,
        createdAt: batch.createdAt
      }
    };
  } catch (err) {
    await transaction.rollback();
    throw err.status ? err : serviceError(500, 'Gagal menyimpan draft jadwal');
  }
};

const getScheduleBatchDetail = async (id, { user } = {}) => {
  const teacher = await getTeacherContext(user);
  const include = [
    { model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] },
    { model: User, as: 'Submitter', attributes: ['id', 'username'], required: false },
    { model: User, as: 'Approver', attributes: ['id', 'username'], required: false },
    {
      model: ScheduleBatchLog,
      include: [{ model: User, as: 'Actor', attributes: ['id', 'username'], required: false }],
      required: false
    }
  ];

  if (teacher) {
    include.push({
      model: Schedule,
      attributes: ['id'],
      required: true,
      include: [{
        model: TeachingAssignment,
        attributes: ['id'],
        where: { teacherId: teacher.id },
        required: true
      }]
    });
  }

  const batch = await ScheduleBatch.findByPk(id, {
    include
  });

  if (!batch) {
    throw serviceError(404, 'Batch jadwal tidak ditemukan');
  }
  if (teacher && batch.status !== 'approved') {
    throw serviceError(404, 'Batch jadwal tidak ditemukan');
  }

  const scheduleCount = teacher
    ? await Schedule.count({
      where: { batchId: batch.id },
      include: [{
        model: TeachingAssignment,
        where: { teacherId: teacher.id },
        required: true
      }]
    })
    : await Schedule.count({ where: { batchId: batch.id } });
  const summaryMap = await collectBatchSummaries([batch.id], { teacherId: teacher?.id });
  return formatBatch(batch, scheduleCount, summaryMap.get(batch.id) || createEmptyBatchSummary());
};

const updateBatchStatus = async ({ batchId, actorId, toStatus, notes }) => {
  const batch = await ScheduleBatch.findByPk(batchId);
  if (!batch) {
    throw serviceError(404, 'Batch jadwal tidak ditemukan');
  }

  const transaction = await sequelize.transaction();
  try {
    const now = new Date();
    const normalizedNotes = String(notes || '').trim() || null;
    const fromStatus = batch.status;

    if (toStatus === 'submitted') {
      if (!['draft', 'rejected'].includes(batch.status)) {
        throw serviceError(409, 'Hanya batch draft atau rejected yang dapat diajukan');
      }
      batch.status = 'submitted';
      batch.submittedBy = actorId || null;
      batch.submittedAt = now;
      batch.notes = normalizedNotes || batch.notes;
    } else if (toStatus === 'approved') {
      if (batch.status !== 'submitted') {
        throw serviceError(409, 'Hanya batch submitted yang dapat disetujui');
      }
      batch.status = 'approved';
      batch.approvedBy = actorId || null;
      batch.approvedAt = now;
      batch.notes = normalizedNotes || batch.notes;
    } else if (toStatus === 'rejected') {
      if (batch.status !== 'submitted') {
        throw serviceError(409, 'Hanya batch submitted yang dapat ditolak');
      }
      batch.status = 'rejected';
      batch.approvedBy = actorId || null;
      batch.approvedAt = now;
      batch.notes = normalizedNotes || batch.notes;
    } else {
      throw serviceError(400, 'Status tujuan tidak valid');
    }

    await batch.save({ transaction });
    await ScheduleBatchLog.create({
      batchId: batch.id,
      actorId: actorId || null,
      fromStatus,
      toStatus,
      notes: normalizedNotes
    }, { transaction });
    await transaction.commit();
    return getScheduleBatchDetail(batch.id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const submitScheduleBatch = async ({ batchId, actorId, notes }) => (
  updateBatchStatus({ batchId, actorId, toStatus: 'submitted', notes })
);

const approveScheduleBatch = async ({ batchId, actorId, notes }) => (
  updateBatchStatus({ batchId, actorId, toStatus: 'approved', notes })
);

const rejectScheduleBatch = async ({ batchId, actorId, notes }) => (
  updateBatchStatus({ batchId, actorId, toStatus: 'rejected', notes })
);

const getEditableDraftSchedule = async (id) => {
  const schedule = await Schedule.findByPk(id, {
    include: [{ model: ScheduleBatch }]
  });

  if (!schedule) {
    throw serviceError(404, 'Item jadwal tidak ditemukan');
  }

  ensureBatchEditable(schedule.ScheduleBatch);
  return schedule;
};

const persistDraftScheduleUpdate = async ({ schedule, timeSlot, assignment, room }) => {
  schedule.timeSlotId = timeSlot.id;
  schedule.teachingAssignmentId = assignment.id;
  schedule.rombelId = assignment.rombelId;
  schedule.room = room;
  await schedule.save();

  const refreshed = await Schedule.findByPk(schedule.id, {
    include: scheduleInclude
  });

  return formatScheduleItem(refreshed);
};

const updateDraftScheduleItem = async (id, payload) => {
  const schedule = await getEditableDraftSchedule(id);

  const nextTimeSlotId = payload.timeSlotId !== undefined ? Number(payload.timeSlotId) : schedule.timeSlotId;
  const nextTeachingAssignmentId = payload.teachingAssignmentId !== undefined
    ? Number(payload.teachingAssignmentId)
    : schedule.teachingAssignmentId;
  const nextRoom = payload.room !== undefined ? (String(payload.room || '').trim() || null) : schedule.room;

  const [timeSlot, assignment] = await Promise.all([
    resolveTargetTimeSlot(nextTimeSlotId, schedule),
    resolveTargetTeachingAssignment(nextTeachingAssignmentId, schedule)
  ]);

  await ensureDraftConflictFree({
    schedule,
    batchId: schedule.batchId,
    timeSlot,
    assignment
  });

  return persistDraftScheduleUpdate({
    schedule,
    timeSlot,
    assignment,
    room: nextRoom
  });
};

const moveDraftScheduleItem = async (id, { timeSlotId }) => {
  if (timeSlotId === undefined) {
    throw serviceError(400, 'timeSlotId wajib diisi');
  }

  const schedule = await getEditableDraftSchedule(id);
  const [timeSlot, assignment] = await Promise.all([
    resolveTargetTimeSlot(timeSlotId, schedule),
    resolveTargetTeachingAssignment(schedule.teachingAssignmentId, schedule)
  ]);

  await ensureDraftConflictFree({
    schedule,
    batchId: schedule.batchId,
    timeSlot,
    assignment
  });

  return persistDraftScheduleUpdate({
    schedule,
    timeSlot,
    assignment,
    room: schedule.room
  });
};

const changeDraftScheduleAssignment = async (id, { teachingAssignmentId }) => {
  if (teachingAssignmentId === undefined) {
    throw serviceError(400, 'teachingAssignmentId wajib diisi');
  }

  const schedule = await getEditableDraftSchedule(id);
  const [timeSlot, assignment] = await Promise.all([
    resolveTargetTimeSlot(schedule.timeSlotId, schedule),
    resolveTargetTeachingAssignment(teachingAssignmentId, schedule)
  ]);

  await ensureDraftConflictFree({
    schedule,
    batchId: schedule.batchId,
    timeSlot,
    assignment
  });

  return persistDraftScheduleUpdate({
    schedule,
    timeSlot,
    assignment,
    room: schedule.room
  });
};

module.exports = {
  BATCH_STATUSES,
  approveScheduleBatch,
  changeDraftScheduleAssignment,
  generateDraftScheduleBatch,
  getScheduleBatchDetail,
  listScheduleBatches,
  listScheduleItems,
  moveDraftScheduleItem,
  rejectScheduleBatch,
  submitScheduleBatch,
  updateDraftScheduleItem
};
