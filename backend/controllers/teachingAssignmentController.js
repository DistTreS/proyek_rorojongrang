const { sequelize, TeachingAssignment, Tendik, Subject, Rombel, AcademicPeriod } = require('../models');

const list = async (req, res) => {
  const assignments = await TeachingAssignment.findAll({
    include: [
      { model: Tendik, attributes: ['id', 'name', 'type'] },
      { model: Subject, attributes: ['id', 'name', 'code'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'periodId'] },
      { model: AcademicPeriod, attributes: ['id', 'name'] }
    ],
    order: [['id', 'DESC']]
  });

  return res.json(assignments.map((item) => ({
    id: item.id,
    weeklyHours: item.weeklyHours,
    teacher: item.Tendik,
    subject: item.Subject,
    rombel: item.Rombel,
    period: item.AcademicPeriod
  })));
};

const detail = async (req, res) => {
  const { id } = req.params;
  const assignment = await TeachingAssignment.findByPk(id, {
    include: [
      { model: Tendik, attributes: ['id', 'name', 'type'] },
      { model: Subject, attributes: ['id', 'name', 'code'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'periodId'] },
      { model: AcademicPeriod, attributes: ['id', 'name'] }
    ]
  });

  if (!assignment) {
    return res.status(404).json({ message: 'Pengampu mapel tidak ditemukan' });
  }

  return res.json({
    id: assignment.id,
    weeklyHours: assignment.weeklyHours,
    teacher: assignment.Tendik,
    subject: assignment.Subject,
    rombel: assignment.Rombel,
    period: assignment.AcademicPeriod
  });
};

const create = async (req, res) => {
  const { teacherId, subjectId, rombelId, periodId, weeklyHours } = req.body;
  if (!teacherId || !subjectId || !rombelId || !periodId) {
    return res.status(400).json({ message: 'Guru, mapel, rombel, dan periode wajib diisi' });
  }

  const [teacher, subject, rombel, period] = await Promise.all([
    Tendik.findByPk(teacherId),
    Subject.findByPk(subjectId),
    Rombel.findByPk(rombelId),
    AcademicPeriod.findByPk(periodId)
  ]);

  if (!teacher || teacher.type !== 'guru') {
    return res.status(400).json({ message: 'Guru tidak valid' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Mapel tidak valid' });
  }
  if (!rombel) {
    return res.status(400).json({ message: 'Rombel tidak valid' });
  }
  if (!period) {
    return res.status(400).json({ message: 'Periode tidak valid' });
  }

  if (rombel.periodId !== period.id) {
    return res.status(400).json({ message: 'Rombel tidak sesuai periode' });
  }

  const transaction = await sequelize.transaction();
  try {
    const assignment = await TeachingAssignment.create({
      teacherId,
      subjectId,
      rombelId,
      periodId,
      weeklyHours: weeklyHours || 0
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      id: assignment.id,
      weeklyHours: assignment.weeklyHours,
      teacher,
      subject,
      rombel,
      period
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat pengampu' });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { teacherId, subjectId, rombelId, periodId, weeklyHours } = req.body;
  const assignment = await TeachingAssignment.findByPk(id);

  if (!assignment) {
    return res.status(404).json({ message: 'Pengampu mapel tidak ditemukan' });
  }

  const nextTeacherId = teacherId ?? assignment.teacherId;
  const nextSubjectId = subjectId ?? assignment.subjectId;
  const nextRombelId = rombelId ?? assignment.rombelId;
  const nextPeriodId = periodId ?? assignment.periodId;

  const [teacher, subject, rombel, period] = await Promise.all([
    Tendik.findByPk(nextTeacherId),
    Subject.findByPk(nextSubjectId),
    Rombel.findByPk(nextRombelId),
    AcademicPeriod.findByPk(nextPeriodId)
  ]);

  if (!teacher || teacher.type !== 'guru') {
    return res.status(400).json({ message: 'Guru tidak valid' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Mapel tidak valid' });
  }
  if (!rombel) {
    return res.status(400).json({ message: 'Rombel tidak valid' });
  }
  if (!period) {
    return res.status(400).json({ message: 'Periode tidak valid' });
  }
  if (rombel.periodId !== period.id) {
    return res.status(400).json({ message: 'Rombel tidak sesuai periode' });
  }

  assignment.teacherId = nextTeacherId;
  assignment.subjectId = nextSubjectId;
  assignment.rombelId = nextRombelId;
  assignment.periodId = nextPeriodId;
  if (weeklyHours !== undefined) assignment.weeklyHours = weeklyHours;

  await assignment.save();

  return res.json({
    id: assignment.id,
    weeklyHours: assignment.weeklyHours,
    teacher,
    subject,
    rombel,
    period
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const assignment = await TeachingAssignment.findByPk(id);
  if (!assignment) {
    return res.status(404).json({ message: 'Pengampu mapel tidak ditemukan' });
  }

  await assignment.destroy();
  return res.json({ message: 'Pengampu mapel dihapus' });
};

module.exports = {
  list,
  detail,
  create,
  update,
  remove
};
