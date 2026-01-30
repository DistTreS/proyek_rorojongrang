const { sequelize, AcademicPeriod } = require('../models');

const list = async (req, res) => {
  const periods = await AcademicPeriod.findAll({ order: [['startDate', 'DESC']] });
  return res.json(periods.map((period) => ({
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    semester: period.semester,
    isActive: period.isActive
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    return res.status(404).json({ message: 'Periode tidak ditemukan' });
  }
  return res.json({
    id: period.id,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    semester: period.semester,
    isActive: period.isActive
  });
};

const create = async (req, res) => {
  const { name, startDate, endDate, semester, isActive } = req.body;
  if (!name || !startDate || !endDate || !semester) {
    return res.status(400).json({ message: 'Nama, tanggal mulai, tanggal akhir, dan semester wajib diisi' });
  }

  const transaction = await sequelize.transaction();
  try {
    if (isActive) {
      await AcademicPeriod.update({ isActive: false }, { where: {}, transaction });
    }

    const period = await AcademicPeriod.create({
      name,
      startDate,
      endDate,
      semester,
      isActive: Boolean(isActive)
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      id: period.id,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      semester: period.semester,
      isActive: period.isActive
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat periode' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { name, startDate, endDate, semester, isActive } = req.body;
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    return res.status(404).json({ message: 'Periode tidak ditemukan' });
  }

  const transaction = await sequelize.transaction();
  try {
    if (isActive) {
      await AcademicPeriod.update({ isActive: false }, { where: {}, transaction });
    }

    if (name !== undefined) period.name = name;
    if (startDate !== undefined) period.startDate = startDate;
    if (endDate !== undefined) period.endDate = endDate;
    if (semester !== undefined) period.semester = semester;
    if (isActive !== undefined) period.isActive = Boolean(isActive);

    await period.save({ transaction });
    await transaction.commit();

    return res.json({
      id: period.id,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      semester: period.semester,
      isActive: period.isActive
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal memperbarui periode' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const period = await AcademicPeriod.findByPk(id);
  if (!period) {
    return res.status(404).json({ message: 'Periode tidak ditemukan' });
  }

  await period.destroy();
  return res.json({ message: 'Periode dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
