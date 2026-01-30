const { Op } = require('sequelize');
const { sequelize, Student, Rombel } = require('../models');

const list = async (req, res) => {
  const { search } = req.query;
  const where = {};
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { nis: { [Op.like]: `%${search}%` } }
    ];
  }

  const students = await Student.findAll({
    where,
    include: [{ model: Rombel, through: { attributes: [] } }],
    order: [['name', 'ASC']]
  });

  const payload = students.map((student) => ({
    id: student.id,
    nis: student.nis,
    name: student.name,
    gender: student.gender,
    birthDate: student.birthDate,
    rombels: student.Rombels?.map((rombel) => ({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      type: rombel.type,
      periodId: rombel.periodId
    })) || []
  }));

  return res.json(payload);
};

const detail = async (req, res) => {
  const { id } = req.params;
  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  return res.json({
    id: student.id,
    nis: student.nis,
    name: student.name,
    gender: student.gender,
    birthDate: student.birthDate,
    rombels: student.Rombels?.map((rombel) => ({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      type: rombel.type,
      periodId: rombel.periodId
    })) || []
  });
};

const create = async (req, res) => {
  const { nis, name, gender, birthDate, rombelIds } = req.body;

  if (!nis || !name) {
    return res.status(400).json({ message: 'NIS dan nama wajib diisi' });
  }

  const existing = await Student.findOne({ where: { nis } });
  if (existing) {
    return res.status(409).json({ message: 'NIS sudah terdaftar' });
  }

  const transaction = await sequelize.transaction();
  try {
    const student = await Student.create({
      nis,
      name,
      gender: gender || null,
      birthDate: birthDate || null
    }, { transaction });

    if (Array.isArray(rombelIds) && rombelIds.length) {
      const rombels = await Rombel.findAll({ where: { id: rombelIds } });
      if (rombels.length !== rombelIds.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Rombel tidak valid' });
      }
      await student.setRombels(rombels, { transaction });
    }

    await transaction.commit();

    return res.status(201).json({
      id: student.id,
      nis: student.nis,
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate,
      rombels: Array.isArray(rombelIds) ? rombelIds : []
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat siswa' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { nis, name, gender, birthDate, rombelIds } = req.body;

  const student = await Student.findByPk(id, {
    include: [{ model: Rombel, through: { attributes: [] } }]
  });

  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  if (nis) {
    const existing = await Student.findOne({
      where: { nis, id: { [Op.ne]: id } }
    });
    if (existing) {
      return res.status(409).json({ message: 'NIS sudah terdaftar' });
    }
  }

  const transaction = await sequelize.transaction();
  try {
    if (nis !== undefined) student.nis = nis;
    if (name !== undefined) student.name = name;
    if (gender !== undefined) student.gender = gender || null;
    if (birthDate !== undefined) student.birthDate = birthDate || null;
    await student.save({ transaction });

    if (Array.isArray(rombelIds)) {
      if (rombelIds.length) {
        const rombels = await Rombel.findAll({ where: { id: rombelIds } });
        if (rombels.length !== rombelIds.length) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Rombel tidak valid' });
        }
        await student.setRombels(rombels, { transaction });
      } else {
        await student.setRombels([], { transaction });
      }
    }

    await transaction.commit();

    const updated = await Student.findByPk(student.id, {
      include: [{ model: Rombel, through: { attributes: [] } }]
    });

    return res.json({
      id: updated.id,
      nis: updated.nis,
      name: updated.name,
      gender: updated.gender,
      birthDate: updated.birthDate,
      rombels: updated.Rombels?.map((rombel) => ({
        id: rombel.id,
        name: rombel.name,
        gradeLevel: rombel.gradeLevel,
        type: rombel.type,
        periodId: rombel.periodId
      })) || []
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal memperbarui siswa' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const student = await Student.findByPk(id);
  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  await student.destroy();
  return res.json({ message: 'Siswa dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
