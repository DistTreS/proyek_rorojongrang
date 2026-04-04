const { sequelize, AcademicPeriod } = require('../models');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');

const formatPeriod = (period) => ({
  id: period.id,
  name: period.name,
  startDate: period.startDate,
  endDate: period.endDate,
  semester: period.semester,
  isActive: period.isActive
});

const validatePeriodInput = ({ name, startDate, endDate, semester }, { partial = false } = {}) => {
  if (!partial && (!name || !startDate || !endDate || !semester)) {
    throw serviceError(400, 'Nama, tanggal mulai, tanggal akhir, dan semester wajib diisi');
  }

  if (semester !== undefined && !['ganjil', 'genap'].includes(semester)) {
    throw serviceError(400, 'Semester tidak valid');
  }

  if (startDate && endDate && startDate > endDate) {
    throw serviceError(400, 'Tanggal akhir harus setelah atau sama dengan tanggal mulai');
  }
};

const listAcademicPeriods = async (query = {}) => {
  const pagination = parsePagination(query);
  const periods = await AcademicPeriod.findAll({ order: [['startDate', 'DESC']] });
  return paginateItems(periods.map(formatPeriod), pagination);
};

const getAcademicPeriodDetail = async (id) => {
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    throw serviceError(404, 'Periode tidak ditemukan');
  }
  return formatPeriod(period);
};

const createAcademicPeriod = async (payload) => {
  validatePeriodInput(payload);

  const transaction = await sequelize.transaction();
  try {
    if (payload.isActive) {
      await AcademicPeriod.update({ isActive: false }, { where: {}, transaction });
    }

    const period = await AcademicPeriod.create({
      name: String(payload.name).trim(),
      startDate: payload.startDate,
      endDate: payload.endDate,
      semester: payload.semester,
      isActive: Boolean(payload.isActive)
    }, { transaction });

    await transaction.commit();
    return formatPeriod(period);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal membuat periode');
  }
};

const updateAcademicPeriod = async (id, payload) => {
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    throw serviceError(404, 'Periode tidak ditemukan');
  }

  const nextPayload = {
    name: payload.name !== undefined ? String(payload.name || '').trim() : period.name,
    startDate: payload.startDate !== undefined ? payload.startDate : period.startDate,
    endDate: payload.endDate !== undefined ? payload.endDate : period.endDate,
    semester: payload.semester !== undefined ? payload.semester : period.semester
  };
  validatePeriodInput(nextPayload, { partial: true });

  const transaction = await sequelize.transaction();
  try {
    if (payload.isActive) {
      await AcademicPeriod.update({ isActive: false }, { where: {}, transaction });
    }

    if (payload.name !== undefined) period.name = nextPayload.name;
    if (payload.startDate !== undefined) period.startDate = nextPayload.startDate;
    if (payload.endDate !== undefined) period.endDate = nextPayload.endDate;
    if (payload.semester !== undefined) period.semester = nextPayload.semester;
    if (payload.isActive !== undefined) period.isActive = Boolean(payload.isActive);

    await period.save({ transaction });
    await transaction.commit();
    return formatPeriod(period);
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal memperbarui periode');
  }
};

const deleteAcademicPeriod = async (id) => {
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    throw serviceError(404, 'Periode tidak ditemukan');
  }

  await period.destroy();
  return { message: 'Periode dihapus' };
};

module.exports = {
  createAcademicPeriod,
  deleteAcademicPeriod,
  getAcademicPeriodDetail,
  listAcademicPeriods,
  updateAcademicPeriod
};
