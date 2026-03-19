const {
  createSubject,
  deleteSubject,
  getSubjectDetail,
  listSubjects,
  updateSubject
} = require('../services/subjectService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listSubjects(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat mata pelajaran');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getSubjectDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail mapel');
  }
};

const create = async (req, res) => {
  try {
    const data = await createSubject(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat mata pelajaran');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateSubject(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui mata pelajaran');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteSubject(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus mata pelajaran');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
