const { Op } = require('sequelize');
const {
  Schedule,
  TimeSlot,
  TeachingAssignment,
  Subject,
  Tendik,
  Rombel,
  AcademicPeriod
} = require('../models');
const { serviceError } = require('../utils/serviceError');

const BATCH_STATUSES = Object.freeze(['draft', 'submitted', 'approved', 'rejected']);

const ensureStatus = (status) => {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();
  if (!BATCH_STATUSES.includes(normalized)) {
    throw serviceError(400, 'Status batch jadwal tidak valid');
  }
  return normalized;
};

const ensurePeriodId = (periodId) => {
  const normalized = Number(periodId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw serviceError(400, 'Periode akademik tidak valid');
  }
  return normalized;
};

const ensureBatchEditable = (batch) => {
  if (!batch) {
    throw serviceError(404, 'Batch jadwal tidak ditemukan');
  }
  if (batch.status !== 'draft') {
    throw serviceError(409, 'Hanya batch draft yang dapat diedit manual');
  }
};

const resolveTargetTimeSlot = async (timeSlotId, schedule) => {
  const normalizedId = Number(timeSlotId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw serviceError(400, 'Time slot tidak valid');
  }

  const timeSlot = await TimeSlot.findByPk(normalizedId);
  if (!timeSlot) {
    throw serviceError(400, 'Time slot tidak valid');
  }
  if (timeSlot.periodId !== schedule.periodId) {
    throw serviceError(400, 'Time slot harus berada pada periode akademik yang sama');
  }

  return timeSlot;
};

const resolveTargetTeachingAssignment = async (teachingAssignmentId, schedule) => {
  const normalizedId = Number(teachingAssignmentId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw serviceError(400, 'Pengampu tidak valid');
  }

  const assignment = await TeachingAssignment.findByPk(normalizedId, {
    include: [
      { model: Tendik, attributes: ['id', 'name'] },
      { model: Subject, attributes: ['id', 'name', 'periodId'] },
      { model: Rombel, attributes: ['id', 'name', 'periodId'] },
      { model: AcademicPeriod, attributes: ['id', 'name'] }
    ]
  });

  if (!assignment) {
    throw serviceError(400, 'Pengampu tidak valid');
  }
  if (!assignment.Tendik || !assignment.Subject || !assignment.Rombel || !assignment.AcademicPeriod) {
    throw serviceError(400, 'Data pengampu belum lengkap sehingga tidak bisa dipakai pada draft jadwal');
  }
  if (assignment.periodId !== schedule.periodId) {
    throw serviceError(400, 'Pengampu harus berada pada periode akademik yang sama');
  }
  if (assignment.Subject.periodId !== schedule.periodId) {
    throw serviceError(400, 'Mapel pada pengampu tidak sesuai dengan periode akademik draft');
  }
  if (assignment.Rombel.periodId !== schedule.periodId) {
    throw serviceError(400, 'Rombel pada pengampu tidak sesuai dengan periode akademik draft');
  }

  return assignment;
};

const ensureDraftConflictFree = async ({ schedule, batchId, timeSlot, assignment }) => {
  const duplicateRombelSlot = await Schedule.findOne({
    where: {
      id: { [Op.ne]: schedule.id },
      batchId,
      rombelId: assignment.rombelId,
      timeSlotId: timeSlot.id
    }
  });
  if (duplicateRombelSlot) {
    throw serviceError(409, `Rombel ${assignment.Rombel?.name || ''} sudah memiliki pelajaran lain pada time slot tersebut`.trim());
  }

  const teacherConflict = await Schedule.findOne({
    where: {
      id: { [Op.ne]: schedule.id },
      batchId,
      timeSlotId: timeSlot.id
    },
    include: [{
      model: TeachingAssignment,
      where: { teacherId: assignment.teacherId }
    }]
  });
  if (teacherConflict) {
    throw serviceError(409, `Guru ${assignment.Tendik?.name || ''} sudah mengajar di kelas lain pada time slot tersebut`.trim());
  }
};

module.exports = {
  BATCH_STATUSES,
  ensureBatchEditable,
  ensureDraftConflictFree,
  ensurePeriodId,
  ensureStatus,
  resolveTargetTeachingAssignment,
  resolveTargetTimeSlot
};
