const {
  createTeachingAssignment,
  deleteTeachingAssignment,
  getTeachingAssignmentDetail,
  listTeachingAssignments,
  updateTeachingAssignment
} = require('../services/teachingAssignmentService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listTeachingAssignments(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat pengampu mapel');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getTeachingAssignmentDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail pengampu mapel');
  }
};

const create = async (req, res) => {
  try {
    const data = await createTeachingAssignment(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat pengampu mapel');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateTeachingAssignment(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui pengampu mapel');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteTeachingAssignment(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus pengampu mapel');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
