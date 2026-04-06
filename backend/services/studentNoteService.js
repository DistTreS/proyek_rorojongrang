const { StudentNote, Student, User } = require('../models');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');
const { normalizeDateOnly } = require('../utils/temporalValidation');

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

const parseOptionalStudentId = (studentId) => {
  if (studentId === undefined || studentId === null || studentId === '') {
    return null;
  }
  const normalized = Number(studentId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw serviceError(400, 'studentId tidak valid');
  }
  return normalized;
};

const listStudentNotes = async (query = {}) => {
  const pagination = parsePagination(query);
  const {
    studentId,
    category,
    search
  } = query;
  const where = {};
  if (category) where.category = category;
  const normalizedStudentId = parseOptionalStudentId(studentId);
  if (normalizedStudentId) {
    where.studentId = normalizedStudentId;
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
  const actorId = Number(user?.id || user?.sub);
  if (!Number.isInteger(actorId)) {
    throw serviceError(401, 'Unauthorized');
  }
  const normalizedDate = normalizeDateOnly(date, 'Tanggal catatan');

  const studentExists = await Student.findByPk(studentId);
  if (!studentExists) {
    throw serviceError(400, 'Siswa tidak valid');
  }

  const record = await StudentNote.create({
    studentId,
    authorId: actorId,
    category,
    note,
    date: normalizedDate
  });

  const created = await StudentNote.findByPk(record.id, { include: noteInclude });
  return formatNote(created);
};

const updateStudentNote = async ({ user, id, payload }) => {
  const actorId = Number(user?.id || user?.sub);
  if (!Number.isInteger(actorId)) {
    throw serviceError(401, 'Unauthorized');
  }

  const record = await StudentNote.findByPk(id, { include: noteInclude });
  if (!record) {
    throw serviceError(404, 'Catatan tidak ditemukan');
  }

  if (Number(record.authorId) !== actorId) {
    throw serviceError(403, 'Catatan hanya bisa diubah oleh pembuatnya');
  }

  if (payload.category !== undefined) record.category = payload.category;
  if (payload.note !== undefined) record.note = payload.note;
  if (payload.date !== undefined) record.date = normalizeDateOnly(payload.date, 'Tanggal catatan');
  await record.save();

  return formatNote(record);
};

const deleteStudentNote = async ({ user, id }) => {
  const actorId = Number(user?.id || user?.sub);
  if (!Number.isInteger(actorId)) {
    throw serviceError(401, 'Unauthorized');
  }

  const record = await StudentNote.findByPk(id);
  if (!record) {
    throw serviceError(404, 'Catatan tidak ditemukan');
  }

  if (Number(record.authorId) !== actorId) {
    throw serviceError(403, 'Catatan hanya bisa dihapus oleh pembuatnya');
  }

  await record.destroy();
  return { message: 'Catatan dihapus' };
};

module.exports = {
  createStudentNote,
  deleteStudentNote,
  listStudentNotes,
  updateStudentNote
};
