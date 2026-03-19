const {
  createTendik,
  deleteTendik,
  getTendikDetail,
  getTendikTemplateBuffer,
  importTendik,
  listTendik,
  updateTendik
} = require('../services/tendikService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listTendik({ search: req.query.search });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat data tendik');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getTendikDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail tendik');
  }
};

const create = async (req, res) => {
  try {
    const data = await createTendik(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat tendik');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateTendik(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui tendik');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteTendik(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus tendik');
  }
};

const importExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File wajib diunggah' });
  }

  try {
    const result = await importTendik(req.file.buffer);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, 'Gagal import data tendik');
  }
};

const downloadTemplate = async (req, res) => {
  const buffer = getTendikTemplateBuffer();
  res.setHeader('Content-Disposition', 'attachment; filename="template-tendik.xlsx"');
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
