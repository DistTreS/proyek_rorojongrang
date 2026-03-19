const {
  createAdminUser,
  deleteAdminUser,
  getAdminUserDetail,
  getMyProfile,
  listAdminUsers,
  updateAdminUser,
  updateMyProfile
} = require('../services/userAdminService');

const handleError = (res, err, fallbackMessage) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  return res.status(500).json({ message: fallbackMessage });
};

const me = async (req, res) => {
  try {
    const data = await getMyProfile(req.user.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat profil');
  }
};

const updateMe = async (req, res) => {
  try {
    const data = await updateMyProfile(req.user.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui profil');
  }
};

const list = async (req, res) => {
  try {
    const data = await listAdminUsers({ search: req.query.search });
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat data user');
  }
};

const detail = async (req, res) => {
  try {
    const data = await getAdminUserDetail(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memuat detail user');
  }
};

const create = async (req, res) => {
  try {
    const data = await createAdminUser(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal membuat user');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateAdminUser(req.params.id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal memperbarui user');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteAdminUser(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err, 'Gagal menghapus user');
  }
};

module.exports = {
  me,
  updateMe,
  list,
  detail,
  create,
  update,
  remove
};
