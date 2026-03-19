const {
  createStudent,
  deleteStudent,
  getStudentDetail,
  getStudentTemplateBuffer,
  importStudents,
  listStudents,
  updateStudent
} = require('../services/studentService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listStudents({ search: req.query.search, user: req.user });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat data siswa');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getStudentDetail(req.params.id, { user: req.user });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail siswa');
  }
};

const create = async (req, res) => {
  try {
    const data = await createStudent(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat siswa');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateStudent(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui siswa');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteStudent(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus siswa');
  }
};

const importExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File wajib diunggah' });
  }

  try {
    const result = await importStudents(req.file.buffer);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Gagal import data siswa');
  }
};

const downloadTemplate = async (req, res) => {
  const buffer = getStudentTemplateBuffer();
  res.setHeader('Content-Disposition', 'attachment; filename="template-siswa.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buffer);
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  importExcel,
  downloadTemplate
};
