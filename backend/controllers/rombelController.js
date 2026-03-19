const {
  assignStudentsToRombel,
  createRombel,
  deleteRombel,
  getRombelDetail,
  listRombels,
  removeStudentFromRombel,
  updateRombel
} = require('../services/rombelService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listRombels({ ...req.query, user: req.user });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat rombel');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getRombelDetail(req.params.id, { user: req.user });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail rombel');
  }
};

const create = async (req, res) => {
  try {
    const data = await createRombel(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat rombel');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateRombel(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui rombel');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteRombel(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus rombel');
  }
};

const assignStudents = async (req, res) => {
  try {
    const data = await assignStudentsToRombel(req.params.id, req.body.studentIds);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal assign siswa');
  }
};

const removeStudent = async (req, res) => {
  try {
    const data = await removeStudentFromRombel(req.params.id, req.params.studentId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus siswa dari rombel');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  assignStudents,
  removeStudent
};
