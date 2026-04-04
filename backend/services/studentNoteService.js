const { Op } = require('sequelize');
const { StudentNote, Student, User } = require('../models');
const { ensureStudentAccessible, getAccessibleStudentIds } = require('./teacherOperationalService');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');

const noteInclude = [
  { model: Student, attributes: ['id', 'nis', 'name'] },
  { model: User, attributes: ['id', 'username', 'email'] }
];

const formatNote = (note) => ({
  id: note.id,
  student: note.Student,
  author: note.User,
  category: note.category,
  note: note.note,
  date: note.date
});

const buildScopedStudentWhere = async (user, studentId) => {
  const accessibleStudentIds = await getAccessibleStudentIds(user);
  if (accessibleStudentIds === null) {
    return studentId ? Number(studentId) : undefined;
  }

  if (!accessibleStudentIds.length) {
    return null;
  }

  if (studentId) {
    return accessibleStudentIds.includes(Number(studentId)) ? Number(studentId) : null;
  }

  return { [Op.in]: accessibleStudentIds };
};

const listStudentNotes = async (query = {}) => {
  const pagination = parsePagination(query);
  const {
    user,
    studentId,
    category,
    search
  } = query;
  const where = {};
  if (category) where.category = category;

  const scopedStudentWhere = await buildScopedStudentWhere(user, studentId);
  if (scopedStudentWhere === null) {
    return [];
  }
  if (scopedStudentWhere !== undefined) {
    where.studentId = scopedStudentWhere;
  }

  const notes = await StudentNote.findAll({
    where,
    include: noteInclude,
    order: [['date', 'DESC']]
  });

  const keyword = search ? String(search).trim().toLowerCase() : '';
  const formatted = notes.map(formatNote);
  const filtered = keyword
    ? formatted.filter((item) => (
      item.note?.toLowerCase().includes(keyword)
      || item.student?.name?.toLowerCase().includes(keyword)
      || item.student?.nis?.toLowerCase().includes(keyword)
    ))
    : formatted;

  return paginateItems(filtered, pagination);
};

const createStudentNote = async ({ user, payload }) => {
  const { studentId, category, note, date } = payload;
  if (!studentId || !category || !note || !date) {
    throw serviceError(400, 'Data catatan belum lengkap');
  }

  const student = await Student.findByPk(studentId);
  if (!student) {
    throw serviceError(400, 'Siswa tidak valid');
  }

  await ensureStudentAccessible(user, studentId);

  const record = await StudentNote.create({
    studentId,
    authorId: user.sub,
    category,
    note,
    date
  });

  return {
    id: record.id,
    student,
    author: { id: user.sub },
    category: record.category,
    note: record.note,
    date: record.date
  };
};

const updateStudentNote = async ({ user, id, payload }) => {
  const record = await StudentNote.findByPk(id, { include: noteInclude });
  if (!record) {
    throw serviceError(404, 'Catatan tidak ditemukan');
  }

  await ensureStudentAccessible(user, record.studentId);

  if (payload.category !== undefined) record.category = payload.category;
  if (payload.note !== undefined) record.note = payload.note;
  if (payload.date !== undefined) record.date = payload.date;
  await record.save();

  return formatNote(record);
};

const deleteStudentNote = async ({ user, id }) => {
  const record = await StudentNote.findByPk(id);
  if (!record) {
    throw serviceError(404, 'Catatan tidak ditemukan');
  }

  await ensureStudentAccessible(user, record.studentId);
  await record.destroy();
  return { message: 'Catatan dihapus' };
};

module.exports = {
  createStudentNote,
  deleteStudentNote,
  listStudentNotes,
  updateStudentNote
};
