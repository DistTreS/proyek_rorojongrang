const { Op } = require('sequelize');
const { Subject, AcademicPeriod, TeachingAssignment } = require('../models');
const { serviceError } = require('../utils/serviceError');
const {
  SUBJECT_TYPES,
  ensureAcademicPeriod,
  normalizeEnumValue,
  normalizeNullableText,
  normalizeText
} = require('./schedulingSupport');

const formatSubject = (subject) => ({
  id: subject.id,
  code: subject.code,
  name: subject.name,
  type: subject.type,
  periodId: subject.periodId,
  periodName: subject.AcademicPeriod?.name || null
});

const ensureSubjectUniqueness = async ({ name, code, periodId }, { excludeId } = {}) => {
  const nameWhere = { periodId, name };
  if (excludeId) {
    nameWhere.id = { [Op.ne]: excludeId };
  }

  const existingName = await Subject.findOne({ where: nameWhere });
  if (existingName) {
    throw serviceError(409, 'Nama mata pelajaran sudah digunakan pada periode tersebut');
  }

  if (!code) return;

  const codeWhere = { periodId, code };
  if (excludeId) {
    codeWhere.id = { [Op.ne]: excludeId };
  }

  const existingCode = await Subject.findOne({ where: codeWhere });
  if (existingCode) {
    throw serviceError(409, 'Kode mata pelajaran sudah digunakan pada periode tersebut');
  }
};

const validateSubjectInput = async ({ code, name, type, periodId }, { excludeId } = {}) => {
  const normalizedName = normalizeText(name);
  const normalizedCode = normalizeNullableText(code);
  const normalizedType = normalizeEnumValue(type, SUBJECT_TYPES, 'Jenis mapel', 'wajib');

  if (!normalizedName) {
    throw serviceError(400, 'Nama mata pelajaran wajib diisi');
  }

  const period = await ensureAcademicPeriod(periodId);
  await ensureSubjectUniqueness({
    name: normalizedName,
    code: normalizedCode,
    periodId: period.id
  }, { excludeId });

  return {
    code: normalizedCode,
    name: normalizedName,
    type: normalizedType,
    period
  };
};

const listSubjects = async ({ periodId, search } = {}) => {
  const where = {};
  if (periodId) {
    where.periodId = Number(periodId);
  }

  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${String(search).trim()}%` } },
      { code: { [Op.like]: `%${String(search).trim()}%` } }
    ];
  }

  const subjects = await Subject.findAll({
    where,
    include: [{ model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }],
    order: [['periodId', 'DESC'], ['name', 'ASC']]
  });

  return subjects.map(formatSubject);
};

const getSubjectDetail = async (id) => {
  const subject = await Subject.findByPk(id, {
    include: [{ model: AcademicPeriod, attributes: ['id', 'name', 'semester', 'isActive'] }]
  });

  if (!subject) {
    throw serviceError(404, 'Mata pelajaran tidak ditemukan');
  }

  return formatSubject(subject);
};

const createSubject = async (payload) => {
  const validated = await validateSubjectInput(payload);
  const subject = await Subject.create({
    code: validated.code,
    name: validated.name,
    type: validated.type,
    periodId: validated.period.id
  });

  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type,
    periodId: subject.periodId,
    periodName: validated.period.name
  };
};

const updateSubject = async (id, payload) => {
  const subject = await Subject.findByPk(id);
  if (!subject) {
    throw serviceError(404, 'Mata pelajaran tidak ditemukan');
  }

  const nextPayload = {
    code: payload.code !== undefined ? payload.code : subject.code,
    name: payload.name !== undefined ? payload.name : subject.name,
    type: payload.type !== undefined ? payload.type : subject.type,
    periodId: payload.periodId !== undefined ? payload.periodId : subject.periodId
  };

  const validated = await validateSubjectInput(nextPayload, { excludeId: subject.id });
  subject.code = validated.code;
  subject.name = validated.name;
  subject.type = validated.type;
  subject.periodId = validated.period.id;
  await subject.save();

  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    type: subject.type,
    periodId: subject.periodId,
    periodName: validated.period.name
  };
};

const deleteSubject = async (id) => {
  const subject = await Subject.findByPk(id);
  if (!subject) {
    throw serviceError(404, 'Mata pelajaran tidak ditemukan');
  }

  const assignmentCount = await TeachingAssignment.count({ where: { subjectId: id } });
  if (assignmentCount > 0) {
    throw serviceError(409, 'Mapel tidak bisa dihapus karena sudah dipakai pengampu');
  }

  await subject.destroy();
  return { message: 'Mata pelajaran dihapus' };
};

module.exports = {
  createSubject,
  deleteSubject,
  getSubjectDetail,
  listSubjects,
  updateSubject
};
