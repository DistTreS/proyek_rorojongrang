const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const {
  Attendance,
  Student,
  Rombel,
  TimeSlot,
  Subject,
  Tendik,
  AcademicPeriod,
  sequelize,
  User,
  Role
} = require('../models');

const hasRole = (roles, role) => roles.includes(role);
const getTeacherWithRoles = async (teacherId) => {
  return Tendik.findByPk(teacherId, {
    include: [{ model: User, include: [{ model: Role }] }]
  });
};

const normalizeMeetingRows = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.meetingId || `legacy-${row.id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        meetingId: row.meetingId,
        date: row.date,
        rombel: row.Rombel,
        subject: row.Subject,
        teacher: row.Teacher,
        substituteTeacher: row.SubstituteTeacher,
        meetingNote: row.meetingNote,
        timeSlots: new Map(),
        totalStudents: 0,
        statusSummary: { hadir: 0, izin: 0, sakit: 0, alpa: 0 },
        students: new Map()
      });
    }
    const entry = grouped.get(key);
    if (row.TimeSlot) {
      entry.timeSlots.set(row.TimeSlot.id, row.TimeSlot);
    }
    if (row.Student) {
      if (!entry.students.has(row.Student.id)) {
        entry.students.set(row.Student.id, row.status);
      }
    }
  });

  return Array.from(grouped.values()).map((item) => {
    item.students.forEach((status) => {
      item.statusSummary[status] = (item.statusSummary[status] || 0) + 1;
      item.totalStudents += 1;
    });
    return {
      ...item,
      timeSlots: Array.from(item.timeSlots.values()),
      students: undefined
    };
  });
};

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
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] },
      { model: Subject, attributes: ['id', 'name', 'code'] },
      { model: Tendik, as: 'Teacher', attributes: ['id', 'name'] },
      { model: Tendik, as: 'SubstituteTeacher', attributes: ['id', 'name'] }
    ],
    order: [['date', 'DESC']]
  });

  return res.json(rows.map((row) => ({
    id: row.id,
    meetingId: row.meetingId,
    date: row.date,
    status: row.status,
    note: row.note,
    meetingNote: row.meetingNote,
    attachmentUrl: row.attachmentUrl,
    student: row.Student,
    rombel: row.Rombel,
    timeSlot: row.TimeSlot,
    subject: row.Subject,
    teacher: row.Teacher,
    substituteTeacher: row.SubstituteTeacher
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

const listMeetings = async (req, res) => {
  const { date, rombelId, subjectId } = req.query;
  const where = { meetingId: { [Op.ne]: null } };
  if (date) where.date = date;
  if (rombelId) where.rombelId = rombelId;
  if (subjectId) where.subjectId = subjectId;

  const rows = await Attendance.findAll({
    where,
    include: [
      { model: Student, attributes: ['id'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'type'] },
      { model: Subject, attributes: ['id', 'name', 'code', 'type'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label', 'periodId'] },
      { model: Tendik, as: 'Teacher', attributes: ['id', 'name'] },
      { model: Tendik, as: 'SubstituteTeacher', attributes: ['id', 'name'] }
    ],
    order: [['date', 'DESC']]
  });

  return res.json(normalizeMeetingRows(rows));
};

const detailMeeting = async (req, res) => {
  const { meetingId } = req.params;
  const rows = await Attendance.findAll({
    where: { meetingId },
    include: [
      { model: Student, attributes: ['id', 'nis', 'name', 'gender'] },
      { model: Rombel, attributes: ['id', 'name', 'gradeLevel', 'type', 'periodId'] },
      { model: Subject, attributes: ['id', 'name', 'code', 'type'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label', 'periodId'] },
      { model: Tendik, as: 'Teacher', attributes: ['id', 'name'] },
      { model: Tendik, as: 'SubstituteTeacher', attributes: ['id', 'name'] }
    ],
    order: [['id', 'ASC']]
  });

  if (!rows.length) {
    return res.status(404).json({ message: 'Pertemuan tidak ditemukan' });
  }

  const first = rows[0];
  const timeSlotMap = new Map();
  const studentMap = new Map();
  rows.forEach((row) => {
    if (row.TimeSlot) timeSlotMap.set(row.TimeSlot.id, row.TimeSlot);
    if (!studentMap.has(row.studentId)) {
      studentMap.set(row.studentId, {
        id: row.Student?.id,
        nis: row.Student?.nis,
        name: row.Student?.name,
        gender: row.Student?.gender,
        status: row.status,
        note: row.note,
        attachmentUrl: row.attachmentUrl
      });
    }
  });

  return res.json({
    meetingId,
    date: first.date,
    rombel: first.Rombel,
    subject: first.Subject,
    teacher: first.Teacher,
    substituteTeacher: first.SubstituteTeacher,
    meetingNote: first.meetingNote,
    timeSlots: Array.from(timeSlotMap.values()),
    students: Array.from(studentMap.values())
  });
};

const createMeeting = async (req, res) => {
  const { date, rombelId, timeSlotIds, subjectId, teacherId, substituteTeacherId, meetingNote } = req.body;
  if (!date || !rombelId || !subjectId || !teacherId || !Array.isArray(timeSlotIds) || !timeSlotIds.length) {
    return res.status(400).json({ message: 'Data pertemuan belum lengkap' });
  }

  const [rombel, subject, teacher] = await Promise.all([
    Rombel.findByPk(rombelId),
    Subject.findByPk(subjectId),
    getTeacherWithRoles(teacherId)
  ]);

  if (!rombel || !subject) {
    return res.status(400).json({ message: 'Rombel atau mapel tidak valid' });
  }

  const teacherRoles = teacher?.User?.Roles?.map((role) => role.name) || [];
  if (!teacher || !hasRole(teacherRoles, 'guru')) {
    return res.status(400).json({ message: 'Guru tidak valid' });
  }

  const substitute = substituteTeacherId ? await Tendik.findByPk(substituteTeacherId) : null;

  const slots = await TimeSlot.findAll({
    where: { id: timeSlotIds }
  });

  if (slots.length !== timeSlotIds.length) {
    return res.status(400).json({ message: 'Jam pelajaran tidak valid' });
  }

  const periodId = rombel.periodId;
  const invalidSlot = slots.find((slot) => slot.periodId !== periodId);
  if (invalidSlot) {
    return res.status(400).json({ message: 'Jam pelajaran tidak sesuai periode rombel' });
  }

  const students = await rombel.getStudents();
  if (!students.length) {
    return res.status(400).json({ message: 'Rombel belum memiliki siswa' });
  }

  const meetingId = uuidv4();
  const transaction = await sequelize.transaction();
  try {
    const payload = [];
    students.forEach((student) => {
      slots.forEach((slot) => {
        payload.push({
          meetingId,
          studentId: student.id,
          rombelId,
          timeSlotId: slot.id,
          subjectId,
          teacherId,
          substituteTeacherId: substitute?.id || null,
          date,
          status: 'hadir',
          note: null,
          meetingNote: meetingNote || null,
          attachmentUrl: null
        });
      });
    });

    await Attendance.bulkCreate(payload, { transaction });
    await transaction.commit();

    return res.status(201).json({
      meetingId,
      totalStudents: students.length,
      totalRecords: payload.length
    });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal membuat pertemuan' });
  }
};

const updateMeetingEntries = async (req, res) => {
  const { meetingId } = req.params;
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ message: 'Entries wajib diisi' });
  }

  const transaction = await sequelize.transaction();
  try {
    for (const entry of entries) {
      if (!entry.studentId) continue;
      const payload = {};
      if (entry.status) payload.status = entry.status;
      if (entry.note !== undefined) payload.note = entry.note || null;
      if (entry.attachmentUrl !== undefined) payload.attachmentUrl = entry.attachmentUrl || null;
      await Attendance.update(payload, {
        where: { meetingId, studentId: entry.studentId },
        transaction
      });
    }
    await transaction.commit();
    return res.json({ message: 'Presensi diperbarui' });
  } catch (err) {
    await transaction.rollback();
    return res.status(500).json({ message: 'Gagal memperbarui presensi' });
  }
};

const uploadMeetingAttachment = async (req, res) => {
  const { meetingId, studentId } = req.params;
  if (!req.file) {
    return res.status(400).json({ message: 'File tidak ditemukan' });
  }
  const attachmentUrl = `/uploads/attendance/${req.file.filename}`;
  await Attendance.update(
    { attachmentUrl },
    { where: { meetingId, studentId } }
  );
  return res.json({ attachmentUrl });
};

const deleteMeeting = async (req, res) => {
  const { meetingId } = req.params;
  await Attendance.destroy({ where: { meetingId } });
  return res.json({ message: 'Pertemuan dihapus' });
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
  listMeetings,
  detailMeeting,
  createMeeting,
  updateMeetingEntries,
  uploadMeetingAttachment,
  deleteMeeting,
  create,
  update,
  remove,
  summary
};
