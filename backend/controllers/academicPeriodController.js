const {
  createAcademicPeriod,
  deleteAcademicPeriod,
  getAcademicPeriodDetail,
  listAcademicPeriods,
  updateAcademicPeriod
} = require('../services/academicPeriodService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const list = async (req, res) => {
  try {
    const data = await listAcademicPeriods();
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat periode');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getAcademicPeriodDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail periode');
  }
};

const create = async (req, res) => {
  try {
    const data = await createAcademicPeriod(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat periode');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateAcademicPeriod(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui periode');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteAcademicPeriod(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus periode');
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
