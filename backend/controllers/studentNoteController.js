const { StudentNote, Student, User } = require('../models');

const list = async (req, res) => {
  const { studentId, category } = req.query;
  const where = {};
  if (studentId) where.studentId = studentId;
  if (category) where.category = category;

  const notes = await StudentNote.findAll({
    where,
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: User, attributes: ['id', 'username', 'email'] }
    ],
    order: [['date', 'DESC']]
  });

  return res.json(notes.map((note) => ({
    id: note.id,
    student: note.Student,
    author: note.User,
    category: note.category,
    note: note.note,
    date: note.date
  })));
};

const create = async (req, res) => {
  const { studentId, category, note, date } = req.body;
  if (!studentId || !category || !note || !date) {
    return res.status(400).json({ message: 'Data catatan belum lengkap' });
  }

  const student = await Student.findByPk(studentId);
  if (!student) {
    return res.status(400).json({ message: 'Siswa tidak valid' });
  }

  const record = await StudentNote.create({
    studentId,
    authorId: req.user.sub,
    category,
    note,
    date
  });

  return res.status(201).json({
    id: record.id,
    student,
    author: { id: req.user.sub },
    category: record.category,
    note: record.note,
    date: record.date
  });
};

const update = async (req, res) => {
  const { id } = req.params;
  const { category, note, date } = req.body;
  const record = await StudentNote.findByPk(id, {
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: User, attributes: ['id', 'username', 'email'] }
    ]
  });

  if (!record) {
    return res.status(404).json({ message: 'Catatan tidak ditemukan' });
  }

  if (category !== undefined) record.category = category;
  if (note !== undefined) record.note = note;
  if (date !== undefined) record.date = date;
  await record.save();

  return res.json({
    id: record.id,
    student: record.Student,
    author: record.User,
    category: record.category,
    note: record.note,
    date: record.date
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const record = await StudentNote.findByPk(id);
  if (!record) {
    return res.status(404).json({ message: 'Catatan tidak ditemukan' });
  }
  await record.destroy();
  return res.json({ message: 'Catatan dihapus' });
};

module.exports = {
  list,
  create,
  update,
  remove
};
