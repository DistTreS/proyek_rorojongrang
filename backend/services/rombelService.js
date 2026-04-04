const { Op } = require('sequelize');
const { sequelize, Rombel, AcademicPeriod, Student, TeachingAssignment, Schedule } = require('../models');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');
const {
  ROMBEL_TYPES,
  ensureAcademicPeriod,
  normalizeEnumValue,
  normalizeNullableText,
  normalizeText
} = require('./schedulingSupport');
const { getAccessibleRombelIds } = require('./teacherOperationalService');

const formatRombel = (rombel) => ({
  id: rombel.id,
  name: rombel.name,
  gradeLevel: rombel.gradeLevel,
  type: rombel.type,
  periodId: rombel.periodId,
  periodName: rombel.AcademicPeriod?.name || null
});

const validateRombelInput = async ({ name, gradeLevel, type, periodId }, { excludeId } = {}) => {
  const normalizedName = normalizeText(name);
  const normalizedType = normalizeEnumValue(type, ROMBEL_TYPES, 'Jenis rombel', 'utama');
  const normalizedGradeLevel = normalizeNullableText(gradeLevel);

  if (!normalizedName) {
    throw serviceError(400, 'Nama rombel wajib diisi');
  }

  if (normalizedType === 'utama' && !normalizedGradeLevel) {
    throw serviceError(400, 'Tingkat wajib diisi untuk rombel utama');
  }

  const period = await ensureAcademicPeriod(periodId);

  const duplicateWhere = {
    periodId: period.id,
    name: normalizedName
  };
  if (excludeId) {
    duplicateWhere.id = { [Op.ne]: excludeId };
  }

  const existing = await Rombel.findOne({ where: duplicateWhere });
  if (existing) {
    throw serviceError(409, 'Nama rombel sudah digunakan pada periode tersebut');
  }

  return {
    name: normalizedName,
    gradeLevel: normalizedGradeLevel,
    type: normalizedType,
    period
  };
};

const listRombels = async (query = {}) => {
  const pagination = parsePagination(query);
  const { periodId, user } = query;
  const where = {};
  if (periodId) {
    where.periodId = Number(periodId);
  }

  const accessibleRombelIds = await getAccessibleRombelIds(user, { periodId });
  if (accessibleRombelIds !== null) {
    if (!accessibleRombelIds.length) {
      return paginateItems([], pagination);
    }
    where.id = { [Op.in]: accessibleRombelIds };
  }

  const rombels = await Rombel.findAll({
    where,
    include: [{ model: AcademicPeriod }],
    order: [['periodId', 'DESC'], ['name', 'ASC']]
  });

  return paginateItems(rombels.map(formatRombel), pagination);
};

const getRombelDetail = async (id, { user } = {}) => {
  const accessibleRombelIds = await getAccessibleRombelIds(user);
  if (accessibleRombelIds !== null && !accessibleRombelIds.includes(Number(id))) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  const rombel = await Rombel.findByPk(id, {
    include: [
      { model: AcademicPeriod },
      { model: Student, through: { attributes: [] }, order: [['name', 'ASC']] }
    ]
  });

  if (!rombel) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  return {
    ...formatRombel(rombel),
    students: (rombel.Students || []).map((student) => ({
      id: student.id,
      nis: student.nis,
      name: student.name,
      gender: student.gender
    }))
  };
};

const createRombel = async (payload) => {
  const validated = await validateRombelInput(payload);

  const rombel = await Rombel.create({
    name: validated.name,
    gradeLevel: validated.gradeLevel,
    type: validated.type,
    periodId: validated.period.id
  });

  return {
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    type: rombel.type,
    periodId: rombel.periodId,
    periodName: validated.period.name
  };
};

const updateRombel = async (id, payload) => {
  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  const nextPayload = {
    name: payload.name !== undefined ? payload.name : rombel.name,
    gradeLevel: payload.gradeLevel !== undefined ? payload.gradeLevel : rombel.gradeLevel,
    type: payload.type !== undefined ? payload.type : rombel.type,
    periodId: payload.periodId !== undefined ? payload.periodId : rombel.periodId
  };

  const validated = await validateRombelInput(nextPayload, { excludeId: rombel.id });
  rombel.name = validated.name;
  rombel.gradeLevel = validated.gradeLevel;
  rombel.type = validated.type;
  rombel.periodId = validated.period.id;
  await rombel.save();

  return {
    id: rombel.id,
    name: rombel.name,
    gradeLevel: rombel.gradeLevel,
    type: rombel.type,
    periodId: rombel.periodId,
    periodName: validated.period.name
  };
};

const deleteRombel = async (id) => {
  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  const assignmentCount = await TeachingAssignment.count({ where: { rombelId: id } });
  const scheduleCount = await Schedule.count({ where: { rombelId: id } });
  if (assignmentCount > 0 || scheduleCount > 0) {
    throw serviceError(409, 'Rombel tidak bisa dihapus karena sudah dipakai pada pengampu atau jadwal');
  }

  await rombel.destroy();
  return { message: 'Rombel dihapus' };
};

const assignStudentsToRombel = async (id, studentIds) => {
  if (!Array.isArray(studentIds)) {
    throw serviceError(400, 'studentIds harus berupa array');
  }

  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  const normalizedIds = [...new Set(studentIds.map((studentId) => Number(studentId)).filter(Number.isInteger))];
  if (!normalizedIds.length) {
    return { message: 'Tidak ada siswa yang ditambahkan', total: 0 };
  }

  const students = await Student.findAll({ where: { id: normalizedIds } });
  if (students.length !== normalizedIds.length) {
    throw serviceError(400, 'Siswa tidak valid');
  }

  const transaction = await sequelize.transaction();
  try {
    const existing = await rombel.getStudents({ attributes: ['id'], transaction });
    const existingIds = new Set(existing.map((student) => student.id));
    const toAdd = students.filter((student) => !existingIds.has(student.id));

    if (toAdd.length) {
      await rombel.addStudents(toAdd, { transaction });
    }

    await transaction.commit();
    return { message: 'Siswa berhasil ditambahkan', total: toAdd.length };
  } catch (err) {
    await transaction.rollback();
    if (err.status) throw err;
    throw serviceError(500, 'Gagal assign siswa');
  }
};

const removeStudentFromRombel = async (id, studentId) => {
  const rombel = await Rombel.findByPk(id);
  if (!rombel) {
    throw serviceError(404, 'Rombel tidak ditemukan');
  }

  const student = await Student.findByPk(studentId);
  if (!student) {
    throw serviceError(404, 'Siswa tidak ditemukan');
  }

  await rombel.removeStudent(student);
  return { message: 'Siswa berhasil dihapus dari rombel' };
};

module.exports = {
  assignStudentsToRombel,
  createRombel,
  deleteRombel,
  getRombelDetail,
  listRombels,
  removeStudentFromRombel,
  updateRombel
};
