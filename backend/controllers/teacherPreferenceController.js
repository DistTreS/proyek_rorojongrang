const {
  createTeacherPreference,
  deleteTeacherPreference,
  getTeacherPreferenceDetail,
  listTeacherPreferences,
  updateTeacherPreference
} = require('../services/teacherPreferenceService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listTeacherPreferences(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat preferensi guru');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getTeacherPreferenceDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail preferensi guru');
  }
};

const create = async (req, res) => {
  try {
    const data = await createTeacherPreference(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat preferensi guru');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateTeacherPreference(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui preferensi guru');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteTeacherPreference(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus preferensi guru');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
