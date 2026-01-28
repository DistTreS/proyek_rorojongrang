const { Op } = require('sequelize');
const { Attendance, Student, Rombel, TimeSlot } = require('../models');

const list = async (req, res) => {
  const { date, rombelId, studentId, timeSlotId } = req.query;
  const where = {};
  if (date) where.date = date;
  if (rombelId) where.rombelId = rombelId;
  if (studentId) where.studentId = studentId;
  if (timeSlotId) where.timeSlotId = timeSlotId;

  const rows = await Attendance.findAll({
    where,
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: Rombel, attributes: ['id', 'name'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] }
    ],
    order: [['date', 'DESC']]
  });

  return res.json(rows.map((row) => ({
    id: row.id,
    date: row.date,
    status: row.status,
    note: row.note,
    student: row.Student,
    rombel: row.Rombel,
    timeSlot: row.TimeSlot
  })));
};

const create = async (req, res) => {
  const { studentId, rombelId, timeSlotId, date, status, note } = req.body;
  if (!studentId || !rombelId || !timeSlotId || !date || !status) {
    return res.status(400).json({ message: 'Data presensi belum lengkap' });
  }

  const [student, rombel, timeSlot] = await Promise.all([
    Student.findByPk(studentId),
    Rombel.findByPk(rombelId),
    TimeSlot.findByPk(timeSlotId)
  ]);

  if (!student || !rombel || !timeSlot) {
    return res.status(400).json({ message: 'Data siswa/rombel/jam tidak valid' });
  }

  const exists = await Attendance.findOne({
    where: { studentId, timeSlotId, date }
  });

  if (exists) {
    return res.status(409).json({ message: 'Presensi sudah ada' });
  }

  const attendance = await Attendance.create({
    studentId,
    rombelId,
    timeSlotId,
    date,
    status,
    note: note || null
  });

  return res.status(201).json({
    id: attendance.id,
    date: attendance.date,
    status: attendance.status,
    note: attendance.note,
    student,
    rombel,
    timeSlot
  });
};

const update = async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;
  const attendance = await Attendance.findByPk(id, {
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: Rombel, attributes: ['id', 'name'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] }
    ]
  });

  if (!attendance) {
    return res.status(404).json({ message: 'Presensi tidak ditemukan' });
  }

  if (status !== undefined) attendance.status = status;
  if (note !== undefined) attendance.note = note || null;
  await attendance.save();

  return res.json({
    id: attendance.id,
    date: attendance.date,
    status: attendance.status,
    note: attendance.note,
    student: attendance.Student,
    rombel: attendance.Rombel,
    timeSlot: attendance.TimeSlot
  });
};

const remove = async (req, res) => {
  const { id } = req.params;
  const attendance = await Attendance.findByPk(id);
  if (!attendance) {
    return res.status(404).json({ message: 'Presensi tidak ditemukan' });
  }
  await attendance.destroy();
  return res.json({ message: 'Presensi dihapus' });
};

const summary = async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    return res.status(400).json({ message: 'dateFrom dan dateTo wajib diisi' });
  }

  const rows = await Attendance.findAll({
    attributes: [
      'status',
      [Attendance.sequelize.fn('COUNT', Attendance.sequelize.col('status')), 'total']
    ],
    where: {
      date: {
        [Op.between]: [dateFrom, dateTo]
      }
    },
    group: ['status']
  });

  const summaryMap = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  rows.forEach((row) => {
    summaryMap[row.status] = Number(row.get('total'));
  });

  return res.json(summaryMap);
};

module.exports = {
  list,
  create,
  update,
  remove,
  summary
};
