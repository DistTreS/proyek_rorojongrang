const {
  approveScheduleBatch,
  getScheduleBatchDetail,
  changeDraftScheduleAssignment,
  generateDraftScheduleBatch,
  listScheduleBatches,
  listScheduleItems,
  moveDraftScheduleItem,
  rejectScheduleBatch,
  submitScheduleBatch,
  updateDraftScheduleItem
} = require('../services/scheduleBatchService');
const { validateScheduleGenerationData } = require('../services/scheduleValidationService');
const { handleControllerError, serializeValidationResult } = require('../utils/controllerUtils');

const list = async (req, res) => {
  try {
    const data = await listScheduleItems({ ...req.query, user: req.user });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat jadwal');
  }
};

const listBatches = async (req, res) => {
  try {
    const data = await listScheduleBatches({ ...req.query, user: req.user });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat batch jadwal');
  }
};

const batchDetail = async (req, res) => {
  try {
    const data = await getScheduleBatchDetail(req.params.batchId, { user: req.user });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat detail batch jadwal');
  }
};

const validate = async (req, res) => {
  try {
    const periodId = req.query.periodId ?? req.body?.periodId;
    const result = await validateScheduleGenerationData(periodId);
    return res.json(serializeValidationResult(result));
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memvalidasi data penjadwalan');
  }
};

const generate = async (req, res) => {
  const { periodId, constraints } = req.body;
  if (!periodId) {
    return res.status(400).json({ message: 'Periode wajib diisi' });
  }

  try {
    const data = await generateDraftScheduleBatch({
      periodId,
      constraints,
      userId: req.user?.id || null
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menyimpan draft jadwal');
  }
};

const updateItem = async (req, res) => {
  try {
    const data = await updateDraftScheduleItem(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memperbarui item draft jadwal');
  }
};

const moveItemSlot = async (req, res) => {
  try {
    const data = await moveDraftScheduleItem(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memindahkan slot jadwal draft');
  }
};

const changeItemAssignment = async (req, res) => {
  try {
    const data = await changeDraftScheduleAssignment(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal mengganti pengampu jadwal draft');
  }
};

const submitBatch = async (req, res) => {
  try {
    const data = await submitScheduleBatch({
      batchId: req.params.batchId,
      actorId: req.user?.id || null,
      notes: req.body?.notes
    });
    return res.json({
      message: 'Batch jadwal berhasil diajukan untuk pengesahan',
      batch: data
    });
  } catch (err) {
    return handleControllerError(res, err, 'Gagal mengajukan batch jadwal');
  }
};

const approveBatch = async (req, res) => {
  try {
    const data = await approveScheduleBatch({
      batchId: req.params.batchId,
      actorId: req.user?.id || null,
      notes: req.body?.notes
    });
    return res.json({
      message: 'Batch jadwal berhasil disetujui',
      batch: data
    });
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menyetujui batch jadwal');
  }
};

const rejectBatch = async (req, res) => {
  try {
    const data = await rejectScheduleBatch({
      batchId: req.params.batchId,
      actorId: req.user?.id || null,
      notes: req.body?.notes
    });
    return res.json({
      message: 'Batch jadwal berhasil ditolak',
      batch: data
    });
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menolak batch jadwal');
  }
};

module.exports = {
  list,
  listBatches,
  batchDetail,
  validate,
  generate,
  updateItem,
  moveItemSlot,
  changeItemAssignment,
  submitBatch,
  approveBatch,
  rejectBatch
};
