const { Op } = require('sequelize');
const { Attendance, Student, Rombel, TimeSlot } = require('../models');
const { getTeacherContext, isGuruUser } = require('./teacherOperationalService');
const { serviceError } = require('../utils/serviceError');

const ensureDateRange = ({ dateFrom, dateTo }) => {
  if (!dateFrom || !dateTo) {
    throw serviceError(400, 'dateFrom dan dateTo wajib diisi');
  }

  return { dateFrom, dateTo };
};

const buildReportScopeWhere = async (user, dateFrom, dateTo) => {
  const where = {
    date: { [Op.between]: [dateFrom, dateTo] }
  };

  if (isGuruUser(user)) {
    const teacher = await getTeacherContext(user);
    where[Op.or] = teacher
      ? [
        { teacherId: teacher.id },
        { substituteTeacherId: teacher.id }
      ]
      : [
        { teacherId: -1 },
        { substituteTeacherId: -1 }
      ];
  }

  return where;
};

const fetchAttendanceRows = async (where) => {
  return Attendance.findAll({
    where,
    include: [
      { model: Student, attributes: ['id', 'nis', 'name'] },
      { model: Rombel, attributes: ['id', 'name'] },
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] }
    ],
    order: [['date', 'ASC']]
  });
};

const getGlobalReport = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
  rows.forEach((row) => {
    summary[row.status] += 1;
    summary.total += 1;
  });

  return { summary, totalRecords: rows.length };
};

const getReportByStudent = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const id = row.studentId;
    if (!acc[id]) {
      acc[id] = {
        student: row.Student,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
    }
    acc[id][row.status] += 1;
    acc[id].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getReportByRombel = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const id = row.rombelId;
    if (!acc[id]) {
      acc[id] = {
        rombel: row.Rombel,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
    }
    acc[id][row.status] += 1;
    acc[id].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getReportByTimeSlot = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const id = row.timeSlotId;
    if (!acc[id]) {
      acc[id] = {
        timeSlot: row.TimeSlot,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
    }
    acc[id][row.status] += 1;
    acc[id].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getDailyReport = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const date = row.date;
    if (!acc[date]) {
      acc[date] = { date, hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
    }
    acc[date][row.status] += 1;
    acc[date].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getMonthlyReport = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const month = row.date.slice(0, 7);
    if (!acc[month]) {
      acc[month] = { month, hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
    }
    acc[month][row.status] += 1;
    acc[month].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getSemesterReport = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const [yearStr, monthStr] = row.date.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const isGanjil = month >= 7 && month <= 12;
    const academicYear = isGanjil ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    const semesterLabel = isGanjil ? 'Ganjil' : 'Genap';
    const key = `${academicYear}-${semesterLabel}`;

    if (!acc[key]) {
      acc[key] = {
        label: `${academicYear} ${semesterLabel}`,
        hadir: 0,
        izin: 0,
        sakit: 0,
        alpa: 0,
        total: 0
      };
    }
    acc[key][row.status] += 1;
    acc[key].total += 1;
    return acc;
  }, {});

  return Object.values(grouped);
};

const getReportByDateRange = async ({ user, dateFrom, dateTo }) => {
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  return {
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    totalRecords: rows.length
  };
};

module.exports = {
  getDailyReport,
  getGlobalReport,
  getMonthlyReport,
  getReportByDateRange,
  getReportByRombel,
  getReportByStudent,
  getReportByTimeSlot,
  getSemesterReport
};
