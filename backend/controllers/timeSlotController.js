const {
  createTimeSlot,
  deleteTimeSlot,
  getTimeSlotDetail,
  listTimeSlots,
  updateTimeSlot
} = require('../services/timeSlotService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listTimeSlots(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat jam pelajaran');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getTimeSlotDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail jam pelajaran');
  }
};

const create = async (req, res) => {
  try {
    const data = await createTimeSlot(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat jam pelajaran');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateTimeSlot(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui jam pelajaran');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteTimeSlot(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus jam pelajaran');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
