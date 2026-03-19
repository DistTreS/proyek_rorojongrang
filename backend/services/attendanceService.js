const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const {
  Attendance,
  Student,
  Rombel,
  TimeSlot,
  Subject,
  Tendik,
  Schedule,
  ScheduleBatch,
  TeachingAssignment,
  sequelize
} = require('../models');
const { getTeacherContext, isGuruUser } = require('./teacherOperationalService');
const { serviceError } = require('../utils/serviceError');

const buildTeacherMeetingScope = (teacherId) => ({
  [Op.or]: [
    { teacherId },
    { substituteTeacherId: teacherId }
  ]
});

const getMeetingDayOfWeek = (date) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getDay();
  return day === 0 ? null : day;
};

const getRequestTeacher = async (user, { required = false } = {}) => {
  if (!isGuruUser(user)) {
    return null;
  }

  const teacher = await getTeacherContext(user);
  if (!teacher) {
    return required ? null : { id: -1 };
  }

  return teacher;
};

const ensureMeetingAccessible = async (user, meetingId) => {
  const teacher = await getRequestTeacher(user);
  if (!teacher) {
    return true;
  }

  const count = await Attendance.count({
    where: {
      meetingId,
      ...buildTeacherMeetingScope(teacher.id)
    }
  });

  return count > 0;
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
    if (row.Student && !entry.students.has(row.Student.id)) {
      entry.students.set(row.Student.id, row.status);
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

const formatAttendanceRow = (row) => ({
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
});

const listAttendance = async ({ user, date, rombelId, studentId, timeSlotId }) => {
  const where = {};
  if (date) where.date = date;
  if (rombelId) where.rombelId = rombelId;
  if (studentId) where.studentId = studentId;
  if (timeSlotId) where.timeSlotId = timeSlotId;

  const teacher = await getRequestTeacher(user);
  if (teacher) {
    Object.assign(where, buildTeacherMeetingScope(teacher.id));
  }

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

  return rows.map(formatAttendanceRow);
};

const createAttendance = async ({ user, payload }) => {
  if (isGuruUser(user)) {
    throw serviceError(405, 'Gunakan pembuatan pertemuan presensi berdasarkan jadwal mengajar');
  }

  const { studentId, rombelId, timeSlotId, date, status, note } = payload;
  if (!studentId || !rombelId || !timeSlotId || !date || !status) {
    throw serviceError(400, 'Data presensi belum lengkap');
  }

  const [student, rombel, timeSlot] = await Promise.all([
    Student.findByPk(studentId),
    Rombel.findByPk(rombelId),
    TimeSlot.findByPk(timeSlotId)
  ]);

  if (!student || !rombel || !timeSlot) {
    throw serviceError(400, 'Data siswa/rombel/jam tidak valid');
  }

  const exists = await Attendance.findOne({
    where: { studentId, timeSlotId, date }
  });
  if (exists) {
    throw serviceError(409, 'Presensi sudah ada');
  }

  const attendance = await Attendance.create({
    studentId,
    rombelId,
    timeSlotId,
    date,
    status,
    note: note || null
  });

  return {
    id: attendance.id,
    date: attendance.date,
    status: attendance.status,
    note: attendance.note,
    student,
    rombel,
    timeSlot
  };
};

const listAttendanceMeetings = async ({ user, date, rombelId, subjectId }) => {
  const where = { meetingId: { [Op.ne]: null } };
  if (date) where.date = date;
  if (rombelId) where.rombelId = rombelId;
  if (subjectId) where.subjectId = subjectId;

  const teacher = await getRequestTeacher(user);
  if (teacher) {
    Object.assign(where, buildTeacherMeetingScope(teacher.id));
  }

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

  return normalizeMeetingRows(rows);
};

const getAttendanceMeetingDetail = async ({ user, meetingId }) => {
  const canAccessMeeting = await ensureMeetingAccessible(user, meetingId);
  if (!canAccessMeeting) {
    throw serviceError(404, 'Pertemuan tidak ditemukan');
  }

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
    throw serviceError(404, 'Pertemuan tidak ditemukan');
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

  return {
    meetingId,
    date: first.date,
    rombel: first.Rombel,
    subject: first.Subject,
    teacher: first.Teacher,
    substituteTeacher: first.SubstituteTeacher,
    meetingNote: first.meetingNote,
    timeSlots: Array.from(timeSlotMap.values()),
    students: Array.from(studentMap.values())
  };
};

const createAttendanceMeeting = async ({ user, payload }) => {
  const { date, rombelId, timeSlotIds, subjectId, substituteTeacherId, meetingNote } = payload;
  if (!date || !rombelId || !subjectId || !Array.isArray(timeSlotIds) || !timeSlotIds.length) {
    throw serviceError(400, 'Data pertemuan belum lengkap');
  }

  const teacher = await getRequestTeacher(user, { required: true });
  if (!teacher) {
    throw serviceError(403, 'Akun guru belum terhubung dengan data tendik guru');
  }

  const uniqueTimeSlotIds = [...new Set(timeSlotIds.map((id) => Number(id)).filter(Number.isInteger))];
  const meetingDay = getMeetingDayOfWeek(date);
  if (!meetingDay) {
    throw serviceError(400, 'Tanggal pertemuan tidak valid atau berada di luar hari belajar');
  }

  const approvedSchedules = await Schedule.findAll({
    where: {
      rombelId: Number(rombelId),
      timeSlotId: { [Op.in]: uniqueTimeSlotIds }
    },
    include: [
      {
        model: ScheduleBatch,
        where: { status: 'approved' },
        required: true
      },
      {
        model: TimeSlot,
        where: { dayOfWeek: meetingDay },
        required: true
      },
      {
        model: TeachingAssignment,
        where: {
          teacherId: teacher.id,
          subjectId: Number(subjectId),
          rombelId: Number(rombelId)
        },
        required: true
      }
    ]
  });

  const matchedSlotIds = [...new Set(approvedSchedules.map((item) => Number(item.timeSlotId)).filter(Boolean))];
  if (matchedSlotIds.length !== uniqueTimeSlotIds.length) {
    throw serviceError(400, 'Presensi hanya bisa dibuat berdasarkan jadwal approved yang Anda ampu');
  }

  const [rombel, subject, substitute] = await Promise.all([
    Rombel.findByPk(rombelId),
    Subject.findByPk(subjectId),
    substituteTeacherId ? Tendik.findByPk(substituteTeacherId) : null
  ]);

  if (!rombel || !subject) {
    throw serviceError(400, 'Rombel atau mapel tidak valid');
  }

  const slots = uniqueTimeSlotIds
    .map((slotId) => approvedSchedules.find((schedule) => schedule.timeSlotId === slotId)?.TimeSlot)
    .filter(Boolean);

  const students = await rombel.getStudents();
  if (!students.length) {
    throw serviceError(400, 'Rombel belum memiliki siswa');
  }

  const meetingId = uuidv4();
  const transaction = await sequelize.transaction();
  try {
    const records = [];
    students.forEach((student) => {
      slots.forEach((slot) => {
        records.push({
          meetingId,
          studentId: student.id,
          rombelId,
          timeSlotId: slot.id,
          subjectId,
          teacherId: teacher.id,
          substituteTeacherId: substitute?.id || null,
          date,
          status: 'hadir',
          note: null,
          meetingNote: meetingNote || null,
          attachmentUrl: null
        });
      });
    });

    await Attendance.bulkCreate(records, { transaction });
    await transaction.commit();

    return {
      meetingId,
      totalStudents: students.length,
      totalRecords: records.length
    };
  } catch (err) {
    await transaction.rollback();
    throw serviceError(500, 'Gagal membuat pertemuan');
  }
};

const updateAttendanceMeetingEntries = async ({ user, meetingId, entries }) => {
  if (!Array.isArray(entries) || !entries.length) {
    throw serviceError(400, 'Entries wajib diisi');
  }

  const canAccessMeeting = await ensureMeetingAccessible(user, meetingId);
  if (!canAccessMeeting) {
    throw serviceError(404, 'Pertemuan tidak ditemukan');
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
    return { message: 'Presensi diperbarui' };
  } catch (err) {
    await transaction.rollback();
    throw serviceError(500, 'Gagal memperbarui presensi');
  }
};

const uploadAttendanceMeetingAttachment = async ({ user, meetingId, studentId, attachmentUrl }) => {
  const canAccessMeeting = await ensureMeetingAccessible(user, meetingId);
  if (!canAccessMeeting) {
    throw serviceError(404, 'Pertemuan tidak ditemukan');
  }

  await Attendance.update(
    { attachmentUrl },
    { where: { meetingId, studentId } }
  );

  return { attachmentUrl };
};

const deleteAttendanceMeeting = async ({ user, meetingId }) => {
  const canAccessMeeting = await ensureMeetingAccessible(user, meetingId);
  if (!canAccessMeeting) {
    throw serviceError(404, 'Pertemuan tidak ditemukan');
  }

  await Attendance.destroy({ where: { meetingId } });
  return { message: 'Pertemuan dihapus' };
};

const updateAttendance = async ({ user, id, payload }) => {
  const attendance = await Attendance.findByPk(id, {
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: Rombel, attributes: ['id', 'name'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] }
    ]
  });

  if (!attendance) {
    throw serviceError(404, 'Presensi tidak ditemukan');
  }

  const teacher = await getRequestTeacher(user);
  if (teacher && attendance.teacherId !== teacher.id && attendance.substituteTeacherId !== teacher.id) {
    throw serviceError(404, 'Presensi tidak ditemukan');
  }

  if (payload.status !== undefined) attendance.status = payload.status;
  if (payload.note !== undefined) attendance.note = payload.note || null;
  await attendance.save();

  return {
    id: attendance.id,
    date: attendance.date,
    status: attendance.status,
    note: attendance.note,
    student: attendance.Student,
    rombel: attendance.Rombel,
    timeSlot: attendance.TimeSlot
  };
};

const deleteAttendance = async ({ user, id }) => {
  const attendance = await Attendance.findByPk(id);
  if (!attendance) {
    throw serviceError(404, 'Presensi tidak ditemukan');
  }

  const teacher = await getRequestTeacher(user);
  if (teacher && attendance.teacherId !== teacher.id && attendance.substituteTeacherId !== teacher.id) {
    throw serviceError(404, 'Presensi tidak ditemukan');
  }

  await attendance.destroy();
  return { message: 'Presensi dihapus' };
};

const getAttendanceSummary = async ({ user, dateFrom, dateTo }) => {
  if (!dateFrom || !dateTo) {
    throw serviceError(400, 'dateFrom dan dateTo wajib diisi');
  }

  const where = {
    date: {
      [Op.between]: [dateFrom, dateTo]
    }
  };
  const teacher = await getRequestTeacher(user);
  if (teacher) {
    Object.assign(where, buildTeacherMeetingScope(teacher.id));
  }

  const rows = await Attendance.findAll({
    attributes: [
      'status',
      [Attendance.sequelize.fn('COUNT', Attendance.sequelize.col('status')), 'total']
    ],
    where,
    group: ['status']
  });

  const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  rows.forEach((row) => {
    summary[row.status] = Number(row.get('total'));
  });

  return summary;
};

module.exports = {
  createAttendance,
  createAttendanceMeeting,
  deleteAttendance,
  deleteAttendanceMeeting,
  getAttendanceMeetingDetail,
  getAttendanceSummary,
  listAttendance,
  listAttendanceMeetings,
  updateAttendance,
  updateAttendanceMeetingEntries,
  uploadAttendanceMeetingAttachment
};
