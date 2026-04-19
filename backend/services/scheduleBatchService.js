const { Op } = require('sequelize');
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
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { serviceError } = require('../utils/serviceError');
const { validateScheduleGenerationData } = require('./scheduleValidationService');
const { getTeacherContext, isGuruScopedUser } = require('./teacherOperationalService');
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

const DAY_LABELS = Object.freeze({
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
});

const EXPORT_DAY_ORDER = Object.freeze([1, 2, 3, 4, 5]);
const SCHEDULE_SCOPES = Object.freeze({
  GLOBAL: 'global',
  PERSONAL: 'personal'
});

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

const normalizeScheduleScope = (scope) => {
  const normalized = String(scope || SCHEDULE_SCOPES.GLOBAL).trim().toLowerCase();
  if (normalized === SCHEDULE_SCOPES.PERSONAL) {
    return SCHEDULE_SCOPES.PERSONAL;
  }
  return SCHEDULE_SCOPES.GLOBAL;
};

const normalizeExportColumnLabels = (rombels) => {
  const used = new Set();
  return rombels.map((rombel) => {
    const base = String(rombel?.name || `Rombel #${rombel?.id || '-'}`).trim() || `Rombel #${rombel?.id || '-'}`;
    let label = base;
    let suffix = 2;
    while (used.has(label)) {
      label = `${base} (${suffix})`;
      suffix += 1;
    }
    used.add(label);
    return { ...rombel, columnLabel: label };
  });
};

const normalizeRombelType = (value) => String(value || '').trim().toLowerCase();

const compareRombelOrder = (a, b) => {
  const typePriority = {
    utama: 0,
    wajib: 0,
    peminatan: 1
  };
  const aType = normalizeRombelType(a?.type);
  const bType = normalizeRombelType(b?.type);
  const aPriority = typePriority[aType] ?? 2;
  const bPriority = typePriority[bType] ?? 2;
  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aGrade = Number(a?.gradeLevel) || 0;
  const bGrade = Number(b?.gradeLevel) || 0;
  if (aGrade !== bGrade) {
    return aGrade - bGrade;
  }

  return String(a?.name || '').localeCompare(String(b?.name || ''), 'id-ID');
};

const buildScheduleMatrixDataset = (items) => {
  const rombelMap = new Map();
  const rowMap = new Map();

  items.forEach((item) => {
    const day = Number(item.timeSlot?.dayOfWeek);
    if (!EXPORT_DAY_ORDER.includes(day)) {
      return;
    }

    const slotId = Number(item.timeSlot?.id || 0);
    const startTime = item.timeSlot?.startTime || '';
    const endTime = item.timeSlot?.endTime || '';
    const label = item.timeSlot?.label || '';
    const rowKey = `${day}::${slotId}::${startTime}::${endTime}::${label}`;

    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, {
        key: rowKey,
        day,
        slotId,
        startTime,
        endTime,
        label,
        cellEntries: new Map()
      });
    }

    const rombelId = Number(item.teachingAssignment?.rombel?.id || item.rombelId || 0);
    const rombelName = item.teachingAssignment?.rombel?.name || `Rombel #${rombelId || '-'}`;
    const rombelType = item.teachingAssignment?.rombel?.type || null;
    const rombelGradeLevel = item.teachingAssignment?.rombel?.gradeLevel || null;
    if (!rombelMap.has(rombelId)) {
      rombelMap.set(rombelId, {
        id: rombelId,
        name: rombelName,
        type: rombelType,
        gradeLevel: rombelGradeLevel
      });
    }

    const mapelName = item.teachingAssignment?.subject?.name || '-';
    const teacherName = item.teachingAssignment?.teacher?.name || '-';
    const cellValue = `${mapelName} / ${teacherName}`;
    const rowRef = rowMap.get(rowKey);
    if (!rowRef.cellEntries.has(rombelId)) {
      rowRef.cellEntries.set(rombelId, []);
    }
    rowRef.cellEntries.get(rombelId).push(cellValue);
  });

  const rombels = normalizeExportColumnLabels(
    [...rombelMap.values()].sort(compareRombelOrder)
  );

  const rows = [...rowMap.values()]
    .sort((a, b) => {
      const dayDiff = a.day - b.day;
      if (dayDiff !== 0) return dayDiff;
      const startDiff = a.startTime.localeCompare(b.startTime);
      if (startDiff !== 0) return startDiff;
      const endDiff = a.endTime.localeCompare(b.endTime);
      if (endDiff !== 0) return endDiff;
      return a.slotId - b.slotId;
    })
    .map((row) => {
      const dayLabel = DAY_LABELS[row.day] || `Hari ${row.day}`;
      const rangeLabel = `${row.startTime || '--:--'} - ${row.endTime || '--:--'}`;
      const slotLabel = row.label ? ` (${row.label})` : '';
      const merged = {
        Waktu: `${dayLabel} • ${rangeLabel}${slotLabel}`
      };

      rombels.forEach((rombel) => {
        const entries = row.cellEntries.get(rombel.id) || [];
        merged[rombel.columnLabel] = entries.length ? [...new Set(entries)].join('\n') : '-';
      });

      return merged;
    });

  if (!rows.length) {
    return {
      rombels,
      rows: [{ Waktu: 'Tidak ada data jadwal untuk parameter yang dipilih' }]
    };
  }

  return { rombels, rows };
};

const buildScheduleMatrixPdfBuffer = ({ rows, columnHeaders, title }) => new Promise((resolve, reject) => {
  const firstColumnWidth = 190;
  const regularColumnWidth = 150;
  const pageWidth = Math.max(842, (firstColumnWidth + (columnHeaders.length * regularColumnWidth) + 48));
  const pageHeight = 595;

  const doc = new PDFDocument({
    size: [pageWidth, pageHeight],
    margin: 24
  });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const columns = ['Waktu', ...columnHeaders];
  const columnWidths = [firstColumnWidth, ...columnHeaders.map(() => regularColumnWidth)];
  const rowPaddingX = 4;
  const rowPaddingY = 4;
  const footerGap = 24;
  let cursorY = doc.page.margins.top;

  const drawHeader = () => {
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(title, doc.page.margins.left, cursorY);
    cursorY += 22;
    doc.fontSize(9).font('Helvetica').fillColor('#475569').text(
      `Dihasilkan: ${new Date().toLocaleString('id-ID')}`,
      doc.page.margins.left,
      cursorY
    );
    cursorY += 18;

    let x = doc.page.margins.left;
    const headerHeight = 26;
    columns.forEach((column, index) => {
      const width = columnWidths[index];
      doc
        .save()
        .lineWidth(0.5)
        .fillColor('#e2e8f0')
        .rect(x, cursorY, width, headerHeight)
        .fillAndStroke('#e2e8f0', '#cbd5e1')
        .restore();
      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text(column, x + rowPaddingX, cursorY + rowPaddingY, {
          width: width - (rowPaddingX * 2),
          align: 'left'
        });
      x += width;
    });
    cursorY += headerHeight;
  };

  const ensurePageCapacity = (height) => {
    if ((cursorY + height) <= (doc.page.height - doc.page.margins.bottom - footerGap)) {
      return;
    }
    doc.addPage({ size: [pageWidth, pageHeight], margin: 24 });
    cursorY = doc.page.margins.top;
    drawHeader();
  };

  drawHeader();

  rows.forEach((row) => {
    const values = columns.map((column) => String(row[column] ?? '-'));
    const rowHeight = Math.max(24, ...values.map((value, index) => (
      doc.heightOfString(value, {
        width: columnWidths[index] - (rowPaddingX * 2),
        align: 'left'
      }) + (rowPaddingY * 2)
    )));

    ensurePageCapacity(rowHeight);

    let x = doc.page.margins.left;
    values.forEach((value, index) => {
      const width = columnWidths[index];
      doc
        .save()
        .lineWidth(0.5)
        .fillColor('#ffffff')
        .rect(x, cursorY, width, rowHeight)
        .fillAndStroke('#ffffff', '#cbd5e1')
        .restore();
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(value, x + rowPaddingX, cursorY + rowPaddingY, {
          width: width - (rowPaddingX * 2),
          align: 'left'
        });
      x += width;
    });
    cursorY += rowHeight;
  });

  doc.end();
});

const getNextVersionNumber = async (periodId, transaction) => {
  const latest = await ScheduleBatch.findOne({
    where: { periodId },
    order: [['versionNumber', 'DESC']],
    transaction
  });
  return (latest?.versionNumber || 0) + 1;
};

const listScheduleBatches = async ({ periodId, status, scope, user } = {}) => {
  const where = {};
  if (periodId) where.periodId = ensurePeriodId(periodId);
  const normalizedScope = normalizeScheduleScope(scope);
  const teacher = await getTeacherContext(user, {
    scopedOnly: normalizedScope !== SCHEDULE_SCOPES.PERSONAL
  });
  const applyTeacherScope = Boolean(teacher && normalizedScope === SCHEDULE_SCOPES.PERSONAL);
  const forceApprovedStatus = isGuruScopedUser(user) || applyTeacherScope;
  const normalizedStatus = ensureStatus(forceApprovedStatus ? 'approved' : status);
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

  if (applyTeacherScope) {
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
    applyTeacherScope ? { teacherId: teacher.id } : {}
  );

  const counts = applyTeacherScope
    ? await Schedule.findAll({
      attributes: ['batchId', [sequelize.fn('COUNT', sequelize.col('Schedule.id')), 'total']],
      include: [{
        model: TeachingAssignment,
        attributes: [],
        where: { teacherId: teacher?.id },
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

const listScheduleItems = async ({ periodId, rombelId, batchId, status, scope, user } = {}) => {
  const where = {};
  const batchWhere = {};
  const normalizedScope = normalizeScheduleScope(scope);
  const teacher = await getTeacherContext(user, {
    scopedOnly: normalizedScope !== SCHEDULE_SCOPES.PERSONAL
  });
  const applyTeacherScope = Boolean(teacher && normalizedScope === SCHEDULE_SCOPES.PERSONAL);
  const forceApprovedStatus = isGuruScopedUser(user) || applyTeacherScope;

  if (forceApprovedStatus) {
    batchWhere.status = 'approved';
  }

  if (rombelId) where.rombelId = Number(rombelId);

  let targetBatchId = batchId ? Number(batchId) : null;
  if (!targetBatchId) {
    const batch = await resolveDefaultBatch({
      periodId,
      status: forceApprovedStatus ? 'approved' : status
    });
    targetBatchId = batch?.id || null;
  }

  if (targetBatchId) {
    where.batchId = targetBatchId;
  } else {
    if (periodId) batchWhere.periodId = ensurePeriodId(periodId);
    const normalizedStatus = ensureStatus(forceApprovedStatus ? 'approved' : status);
    if (normalizedStatus) batchWhere.status = normalizedStatus;
  }

  const schedules = await Schedule.findAll({
    where,
    include: scheduleInclude.map((entry) => (
      entry.model === ScheduleBatch
        ? { ...entry, where: Object.keys(batchWhere).length ? batchWhere : undefined }
        : entry.model === TeachingAssignment && applyTeacherScope
          ? {
            ...entry,
            where: { teacherId: teacher?.id }
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

const exportScheduleItems = async ({ periodId, rombelId, batchId, status, scope, user, format } = {}) => {
  const normalizedFormat = String(format || 'xlsx').trim().toLowerCase();
  if (!['xlsx', 'pdf'].includes(normalizedFormat)) {
    throw serviceError(400, 'Format export harus xlsx atau pdf');
  }

  const items = await listScheduleItems({
    periodId,
    rombelId,
    batchId,
    status,
    scope,
    user
  });

  const matrixDataset = buildScheduleMatrixDataset(items);
  const worksheet = XLSX.utils.json_to_sheet(matrixDataset.rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Matriks Jadwal');

  const batchPart = items[0]?.batch?.versionNumber ? `v${items[0].batch.versionNumber}` : 'all';
  const periodPart = String(items[0]?.batch?.periodName || periodId || 'all')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .toLowerCase();
  const filename = `jadwal-${periodPart}-${batchPart}.${normalizedFormat}`;

  if (normalizedFormat === 'pdf') {
    const buffer = await buildScheduleMatrixPdfBuffer({
      rows: matrixDataset.rows,
      columnHeaders: matrixDataset.rombels.map((rombel) => rombel.columnLabel),
      title: `Matriks Jadwal ${items[0]?.batch?.periodName || ''}`.trim()
    });
    return {
      filename,
      mimeType: 'application/pdf',
      buffer
    };
  }

  const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return {
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: fileBuffer
  };
};

const generateDraftScheduleBatch = async ({ periodId, constraints, userId }) => {
  const normalizedPeriodId = ensurePeriodId(periodId);
  const validation = await validateScheduleGenerationData(normalizedPeriodId, constraints || {});
  if (!validation.valid) {
    throw Object.assign(serviceError(422, validation.message), { validation });
  }

  const assignments = validation.data.assignments;
  const timeSlots = validation.data.timeSlots;
  const teacherPreferences = validation.data.teacherPreferences || [];
  const studentEnrollments = validation.data.studentEnrollments || [];
  const schedulerResult = await generateScheduleItems({
    assignments,
    timeSlots,
    periodId: normalizedPeriodId,
    constraints,
    teacherPreferences,
    studentEnrollments
  });
  const scheduleItems = schedulerResult.scheduleItems;

  if (!scheduleItems.length) {
    const primaryConflict = schedulerResult.conflicts?.[0] || null;
    const diagnosticMessage = primaryConflict?.details?.diagnostics?.[0]?.message
      || primaryConflict?.details?.body?.conflicts?.[0]?.message
      || primaryConflict?.details?.body?.detail
      || null;

    let schedulerMessage = primaryConflict?.message
      || schedulerResult.warnings?.[0]?.message
      || 'Scheduler tidak mengembalikan item jadwal';

    if (diagnosticMessage && !schedulerMessage.includes(diagnosticMessage)) {
      schedulerMessage = `${schedulerMessage} | detail: ${diagnosticMessage}`;
    }

    const reasonCode = primaryConflict?.code || schedulerResult.fallbackReason?.code || null;
    if (reasonCode && !schedulerMessage.includes(`[${reasonCode}]`)) {
      schedulerMessage = `[${reasonCode}] ${schedulerMessage}`;
    }

    throw serviceError(
      422,
      `Gagal membuat draft jadwal: ${schedulerMessage}`,
      {
        scheduler: {
          source: schedulerResult.source,
          engine: schedulerResult.engine,
          generatedAt: schedulerResult.generatedAt,
          requestMeta: schedulerResult.requestMeta,
          fallbackReason: schedulerResult.fallbackReason,
          summary: schedulerResult.summary,
          conflict: primaryConflict,
          warning: schedulerResult.warnings?.[0] || null
        }
      },
      reasonCode || 'SCHEDULE_GENERATE_EMPTY_RESULT'
    );
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
  const teacher = await getTeacherContext(user, { scopedOnly: true });
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

const deactivateOtherApprovedBatchesInPeriod = async ({
  periodId,
  activeBatchId,
  actorId,
  transaction
}) => {
  const previousApprovedBatches = await ScheduleBatch.findAll({
    where: {
      periodId: Number(periodId),
      status: 'approved',
      id: { [Op.ne]: Number(activeBatchId) }
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!previousApprovedBatches.length) {
    return 0;
  }

  const now = new Date();
  const autoDeactivateNote = `Dinonaktifkan otomatis karena batch #${activeBatchId} disetujui sebagai jadwal resmi aktif.`;

  for (const previousBatch of previousApprovedBatches) {
    const fromStatus = previousBatch.status;
    previousBatch.status = 'rejected';
    previousBatch.approvedBy = actorId || previousBatch.approvedBy || null;
    previousBatch.approvedAt = now;
    previousBatch.notes = previousBatch.notes
      ? `${previousBatch.notes}\n\n${autoDeactivateNote}`
      : autoDeactivateNote;
    await previousBatch.save({ transaction });

    await ScheduleBatchLog.create({
      batchId: previousBatch.id,
      actorId: actorId || null,
      fromStatus,
      toStatus: 'rejected',
      notes: autoDeactivateNote
    }, { transaction });
  }

  return previousApprovedBatches.length;
};

const updateBatchStatus = async ({ batchId, actorId, toStatus, notes }) => {
  const transaction = await sequelize.transaction();
  try {
    const batch = await ScheduleBatch.findByPk(batchId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!batch) {
      throw serviceError(404, 'Batch jadwal tidak ditemukan');
    }

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

      await deactivateOtherApprovedBatchesInPeriod({
        periodId: batch.periodId,
        activeBatchId: batch.id,
        actorId,
        transaction
      });

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

const deleteScheduleBatch = async (batchId) => {
  const batch = await ScheduleBatch.findByPk(batchId);
  if (!batch) {
    throw serviceError(404, 'Batch jadwal tidak ditemukan');
  }
  if (batch.status === 'approved') {
    throw serviceError(403, 'Batch yang sudah disetujui tidak dapat dihapus');
  }

  const transaction = await sequelize.transaction();
  try {
    // hapus semua schedule items terlebih dahulu (child records)
    await Schedule.destroy({ where: { batchId: batch.id }, transaction });
    // hapus log
    await ScheduleBatchLog.destroy({ where: { batchId: batch.id }, transaction });
    // hapus batch
    await batch.destroy({ transaction });
    await transaction.commit();
    return {
      message: `Batch V${batch.versionNumber} (${batch.status}) berhasil dihapus`,
      deletedBatchId: batch.id
    };
  } catch (err) {
    await transaction.rollback();
    throw err.status ? err : serviceError(500, 'Gagal menghapus batch jadwal');
  }
};


module.exports = {
  BATCH_STATUSES,
  approveScheduleBatch,
  changeDraftScheduleAssignment,
  deleteScheduleBatch,
  exportScheduleItems,
  generateDraftScheduleBatch,
  getScheduleBatchDetail,
  listScheduleBatches,
  listScheduleItems,
  moveDraftScheduleItem,
  rejectScheduleBatch,
  submitScheduleBatch,
  updateDraftScheduleItem
};
