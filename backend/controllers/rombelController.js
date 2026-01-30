const { sequelize, Rombel, AcademicPeriod, Student } = require('../models');

const allowedTypes = new Set(['utama', 'peminatan']);
const normalizeType = (value) => {
  if (!value) return 'utama';
  const normalized = String(value).toLowerCase();
  return allowedTypes.has(normalized) ? normalized : null;
};

const list = async (req, res) => {
  const rombels = await Rombel.findAll({
    include: [{ model: AcademicPeriod }],
    order: [['name', 'ASC']]
  });

  return res.json(rombels.map((rombel) => ({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    type: rombel.type,
    periodId: rombel.periodId,
    periodName: rombel.AcademicPeriod?.name || null
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const rombel = await Rombel.findByPk(id, {
    include: [
      { model: AcademicPeriod },
      { model: Student, through: { attributes: [] } }
    ]
  });
  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  return res.json({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    type: rombel.type,
    periodId: rombel.periodId,
    periodName: rombel.AcademicPeriod?.name || null,
    students: rombel.Students?.map((student) => ({
      id: student.id,
      nis: student.nis,
      name: student.name,
      gender: student.gender
    })) || []
  });
};

const create = async (req, res) => {
  const { name, gradeLevel, periodId, type } = req.body;
  if (!name || !periodId) {
    return res.status(400).json({ message: 'Nama dan periode wajib diisi' });
  }

  const resolvedType = normalizeType(type);
  if (!resolvedType) {
    return res.status(400).json({ message: 'Jenis rombel tidak valid' });
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
      periodId,
      type: resolvedType
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      id: rombel.id,
      name: rombel.name,
      gradeLevel: rombel.gradeLevel,
      type: rombel.type,
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
  const { name, gradeLevel, periodId, type } = req.body;
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
  if (type !== undefined) {
    const resolvedType = normalizeType(type);
    if (!resolvedType) {
      return res.status(400).json({ message: 'Jenis rombel tidak valid' });
    }
    rombel.type = resolvedType;
  }

  await rombel.save();

  return res.json({
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    type: rombel.type,
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

const assignStudents = async (req, res) => {
  const { id } = req.params;
  const { studentIds } = req.body;

  if (!Array.isArray(studentIds)) {
    return res.status(400).json({ message: 'studentIds harus berupa array' });
  }

  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  const transaction = await sequelize.transaction();
  try {
    if (!studentIds.length) {
      await transaction.commit();
      return res.json({ message: 'Tidak ada siswa yang ditambahkan', total: 0 });
    }

    const students = await Student.findAll({ where: { id: studentIds } });
    if (students.length !== studentIds.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Siswa tidak valid' });
    }

    const existing = await rombel.getStudents({ attributes: ['id'], transaction });
    const existingIds = new Set(existing.map((student) => student.id));
    const toAdd = students.filter((student) => !existingIds.has(student.id));

    if (toAdd.length) {
      await rombel.addStudents(toAdd, { transaction });
    }

    await transaction.commit();
    return res.json({ message: 'Siswa berhasil ditambahkan', total: toAdd.length });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal assign siswa' });
  }
};

const removeStudent = async (req, res) => {
  const { id, studentId } = req.params;

  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    return res.status(404).json({ message: 'Rombel tidak ditemukan' });
  }

  const student = await Student.findByPk(studentId);
  if (!student) {
    return res.status(404).json({ message: 'Siswa tidak ditemukan' });
  }

  try {
    await rombel.removeStudent(student);
    return res.json({ message: 'Siswa berhasil dihapus dari rombel' });
  } catch (err) {
    return res.status(500).json({ message: 'Gagal menghapus siswa dari rombel' });
  }
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove,
  assignStudents,
  removeStudent
};
