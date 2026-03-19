const {
  createStudentNote,
  deleteStudentNote,
  listStudentNotes,
  updateStudentNote
} = require('../services/studentNoteService');
const { handleControllerError } = require('../utils/controllerUtils');

const list = async (req, res) => {
  try {
    const data = await listStudentNotes({
      user: req.user,
      studentId: req.query.studentId,
      category: req.query.category
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat catatan');
  }
};

const create = async (req, res) => {
  try {
    const data = await createStudentNote({ user: req.user, payload: req.body });
    return res.status(201).json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menyimpan catatan');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateStudentNote({
      user: req.user,
      id: req.params.id,
      payload: req.body
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memperbarui catatan');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteStudentNote({ user: req.user, id: req.params.id });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menghapus catatan');
  }
};

module.exports = {
  list,
  create,
  update,
  remove
};
