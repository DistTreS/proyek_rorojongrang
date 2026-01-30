const { sequelize, TeachingAssignment, Tendik, Subject, Rombel, AcademicPeriod, User, Role } = require('../models');

const hasRole = (roles, role) => roles.includes(role);
const getTeacherWithRoles = async (teacherId) => {
  return Tendik.findByPk(teacherId, {
    include: [{ model: User, include: [{ model: Role }] }]
  });
};

const list = async (req, res) => {
  const assignments = await TeachingAssignment.findAll({
    include: [
      { model: Tendik, attributes: ['id', 'name', 'type'] },
      { model: Subject, attributes: ['id', 'name', 'code', 'type'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'periodId', 'type'] },
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
      { model: Subject, attributes: ['id', 'name', 'code', 'type'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'periodId', 'type'] },
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
  const { teacherId, subjectId, rombelId, periodId, weeklyHours, gradeLevel } = req.body;
  if (!teacherId || !subjectId || !periodId) {
    return res.status(400).json({ message: 'Guru, mapel, dan periode wajib diisi' });
  }

  const [teacher, subject, period] = await Promise.all([
    getTeacherWithRoles(teacherId),
    Subject.findByPk(subjectId),
    AcademicPeriod.findByPk(periodId)
  ]);

  const teacherRoles = teacher?.User?.Roles?.map((role) => role.name) || [];
  if (!teacher || !hasRole(teacherRoles, 'guru')) {
    return res.status(400).json({ message: 'Guru tidak valid' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Mapel tidak valid' });
  }
  if (!period) {
    return res.status(400).json({ message: 'Periode tidak valid' });
  }

  const transaction = await sequelize.transaction();
  try {
    if (subject.type === 'wajib') {
      if (!gradeLevel) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Tingkat wajib diisi untuk mapel wajib' });
      }
      const normalizedGrade = String(gradeLevel).trim();
      const gradeAliases = {
        '10': ['10', 'X'],
        '11': ['11', 'XI'],
        '12': ['12', 'XII']
      };
      const gradeList = gradeAliases[normalizedGrade] || [normalizedGrade];
      const rombels = await Rombel.findAll({
        where: { periodId, gradeLevel: gradeList, type: 'utama' },
        transaction
      });
      if (!rombels.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Rombel tingkat tersebut tidak ditemukan' });
      }

      const payload = rombels.map((rombel) => ({
        teacherId,
        subjectId,
        rombelId: rombel.id,
        periodId,
        weeklyHours: weeklyHours || 0
      }));

      await TeachingAssignment.bulkCreate(payload, { transaction });

      await transaction.commit();
      return res.status(201).json({
        message: 'Pengampu mapel wajib dibuat untuk semua rombel tingkat terkait',
        total: payload.length
      });
    }

    if (!rombelId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Rombel wajib diisi untuk mapel peminatan' });
    }

    const rombel = await Rombel.findByPk(rombelId, { transaction });
    if (!rombel) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Rombel tidak valid' });
    }
    if (rombel.periodId !== period.id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Rombel tidak sesuai periode' });
    }
    if (rombel.type !== 'peminatan') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Rombel harus peminatan untuk mapel peminatan' });
    }

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
    getTeacherWithRoles(nextTeacherId),
    Subject.findByPk(nextSubjectId),
    Rombel.findByPk(nextRombelId),
    AcademicPeriod.findByPk(nextPeriodId)
  ]);

  const teacherRoles = teacher?.User?.Roles?.map((role) => role.name) || [];
  if (!teacher || !hasRole(teacherRoles, 'guru')) {
    return res.status(400).json({ message: 'Guru tidak valid' });
  }
  if (!subject) {
    return res.status(400).json({ message: 'Mapel tidak valid' });
  }
  if (!period) {
    return res.status(400).json({ message: 'Periode tidak valid' });
  }
  if (!rombel) {
    return res.status(400).json({ message: 'Rombel tidak valid' });
  }
  if (rombel.periodId !== period.id) {
    return res.status(400).json({ message: 'Rombel tidak sesuai periode' });
  }
  if (subject.type === 'peminatan' && rombel.type !== 'peminatan') {
    return res.status(400).json({ message: 'Rombel harus peminatan untuk mapel peminatan' });
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
