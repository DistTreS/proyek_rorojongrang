const { Op } = require('sequelize');
const { ROLES } = require('../config/rbac');
const { Tendik, TeachingAssignment, Student, Rombel } = require('../models');
const { serviceError } = require('../utils/serviceError');

const isGuruUser = (user) => Array.isArray(user?.roles) && user.roles.includes(ROLES.GURU);

const getTeacherContext = async (user, { required = false } = {}) => {
  if (!isGuruUser(user)) {
    return null;
  }

  const teacher = await Tendik.findOne({
    where: {
      userId: user.id,
      type: 'guru'
    }
  });

  if (!teacher && required) {
    throw serviceError(403, 'Akun guru belum terhubung dengan data tendik guru');
  }

  return teacher;
};

const getAccessibleRombelIds = async (user, { periodId } = {}) => {
  if (!isGuruUser(user)) {
    return null;
  }

  const teacher = await getTeacherContext(user);
  if (!teacher) {
    return [];
  }
  const where = { teacherId: teacher.id };
  if (periodId) {
    where.periodId = Number(periodId);
  }

  const assignments = await TeachingAssignment.findAll({
    attributes: ['rombelId'],
    where,
    raw: true
  });

  return [...new Set(assignments.map((item) => Number(item.rombelId)).filter(Boolean))];
};

const getAccessibleStudentIds = async (user, { periodId } = {}) => {
  if (!isGuruUser(user)) {
    return null;
  }

  const rombelIds = await getAccessibleRombelIds(user, { periodId });
  if (!rombelIds.length) {
    return [];
  }

  const students = await Student.findAll({
    attributes: ['id'],
    include: [{
      model: Rombel,
      through: { attributes: [] },
      attributes: [],
      where: { id: { [Op.in]: rombelIds } },
      required: true
    }],
    raw: true
  });

  return [...new Set(students.map((item) => Number(item.id)).filter(Boolean))];
};

const ensureStudentAccessible = async (user, studentId, options = {}) => {
  const studentIds = await getAccessibleStudentIds(user, options);
  if (studentIds === null) {
    return true;
  }

  if (!studentIds.includes(Number(studentId))) {
    throw serviceError(403, 'Siswa tersebut tidak termasuk rombel yang Anda ampu');
  }

  return true;
};

const ensureRombelAccessible = async (user, rombelId, options = {}) => {
  const rombelIds = await getAccessibleRombelIds(user, options);
  if (rombelIds === null) {
    return true;
  }

  if (!rombelIds.includes(Number(rombelId))) {
    throw serviceError(403, 'Rombel tersebut tidak termasuk kelas yang Anda ampu');
  }

  return true;
};

module.exports = {
  ensureRombelAccessible,
  ensureStudentAccessible,
  getAccessibleRombelIds,
  getAccessibleStudentIds,
  getTeacherContext,
  isGuruUser
};
