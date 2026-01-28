const { sequelize, Rombel, AcademicPeriod } = require('../models');

const list = async (req, res) => {
  const rombels = await Rombel.findAll({
    include: [{ model: AcademicPeriod }],
    order: [['name', 'ASC']]
  });

  return res.json(rombels.map((rombel) => ({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    periodId: rombel.periodId,
    periodName: rombel.AcademicPeriod?.name || null
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const rombel = await Rombel.findByPk(id, { include: [{ model: AcademicPeriod }] });
  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  return res.json({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    periodId: rombel.periodId,
    periodName: rombel.AcademicPeriod?.name || null
  });
};

const create = async (req, res) => {
  const { name, gradeLevel, periodId } = req.body;
  if (!name || !periodId) {
    return res.status(400).json({ message: 'Nama dan periode wajib diisi' });
  }

  const period = await AcademicPeriod.findByPk(periodId);
  if (!period) {
    return res.status(400).json({ message: 'Periode akademik tidak valid' });
  }

  const transaction = await sequelize.transaction();
  try {
    const rombel = await Rombel.create({
      name,
      gradeLevel: gradeLevel || null,
      periodId
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      periodId: rombel.periodId,
      periodName: period.name
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat rombel' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { name, gradeLevel, periodId } = req.body;
  const rombel = await Rombel.findByPk(id);

  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  let period = null;
  if (periodId !== undefined) {
    period = await AcademicPeriod.findByPk(periodId);
    if (!period) {
      return res.status(400).json({ message: 'Periode akademik tidak valid' });
    }
    rombel.periodId = periodId;
  }

  if (name !== undefined) rombel.name = name;
  if (gradeLevel !== undefined) rombel.gradeLevel = gradeLevel || null;

  await rombel.save();

  return res.json({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    periodId: rombel.periodId,
    periodName: period?.name || null
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  await rombel.destroy();
  return res.json({ message: 'Rombel dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
