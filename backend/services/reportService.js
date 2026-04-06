const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { Attendance, Student, Rombel, TimeSlot, Subject, Tendik } = require('../models');
const { getTeacherContext, isGuruScopedUser } = require('./teacherOperationalService');
const { paginateItems, parsePagination } = require('../utils/pagination');
const { serviceError } = require('../utils/serviceError');

const DAY_LABELS = Object.freeze({
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu'
});

const REPORT_TYPES = Object.freeze({
  global: 'global',
  students: 'students',
  rombels: 'rombels',
  slots: 'slots',
  daily: 'daily',
  monthly: 'monthly',
  semester: 'semester',
  teacherSubject: 'teacher-subject'
});

const GURU_ALLOWED_REPORT_TYPES = new Set([
  REPORT_TYPES.daily,
  REPORT_TYPES.monthly,
  REPORT_TYPES.semester,
  REPORT_TYPES.rombels
]);

const ensureDateRange = ({ dateFrom, dateTo }) => {
  if (!dateFrom || !dateTo) {
    throw serviceError(400, 'dateFrom dan dateTo wajib diisi');
  }

  return { dateFrom, dateTo };
};

const normalizeReportType = (type) => {
  const normalized = String(type || '').trim().toLowerCase();
  if (!Object.values(REPORT_TYPES).includes(normalized)) {
    throw serviceError(400, 'Jenis laporan tidak valid');
  }
  return normalized;
};

const ensureReportTypeAllowed = (user, type) => {
  if (!isGuruScopedUser(user)) return;
  if (!GURU_ALLOWED_REPORT_TYPES.has(type)) {
    throw serviceError(403, 'Role guru tidak memiliki akses ke jenis laporan ini');
  }
};

const buildReportScopeWhere = async (user, dateFrom, dateTo) => {
  const where = {
    date: { [Op.between]: [dateFrom, dateTo] }
  };

  if (isGuruScopedUser(user)) {
    const teacher = await getTeacherContext(user, { scopedOnly: true });
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
      { model: TimeSlot, attributes: ['id', 'dayOfWeek', 'startTime', 'endTime', 'label'] },
      { model: Subject, attributes: ['id', 'code', 'name', 'type'] },
      { model: Tendik, as: 'Teacher', attributes: ['id', 'name'] },
      { model: Tendik, as: 'SubstituteTeacher', attributes: ['id', 'name'] }
    ],
    order: [['date', 'ASC']]
  });
};

const paginateReportRows = (rows, query) => paginateItems(rows, parsePagination(query));

const getGlobalReport = async ({ user, dateFrom, dateTo }) => {
  ensureReportTypeAllowed(user, REPORT_TYPES.global);
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
  rows.forEach((row) => {
    summary[row.status] += 1;
    summary.total += 1;
  });

  return { summary, totalRecords: rows.length };
};

const getReportByStudent = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.students);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getReportByRombel = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.rombels);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getReportByTimeSlot = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.slots);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getDailyReport = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.daily);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getMonthlyReport = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.monthly);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getSemesterReport = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.semester);
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

  return paginateReportRows(Object.values(grouped), query);
};

const getReportByTeacherSubject = async (query) => {
  const { user, dateFrom, dateTo } = query;
  ensureReportTypeAllowed(user, REPORT_TYPES.teacherSubject);
  const range = ensureDateRange({ dateFrom, dateTo });
  const rows = await fetchAttendanceRows(await buildReportScopeWhere(user, range.dateFrom, range.dateTo));

  const grouped = rows.reduce((acc, row) => {
    const teacher = row.SubstituteTeacher || row.Teacher;
    const subject = row.Subject;
    const key = `${teacher?.id || 0}-${subject?.id || 0}`;

    if (!acc[key]) {
      acc[key] = {
        teacher: teacher ? { id: teacher.id, name: teacher.name } : null,
        subject: subject ? {
          id: subject.id,
          code: subject.code,
          name: subject.name,
          type: subject.type
        } : null,
        label: `${teacher?.name || 'Guru tidak diketahui'} • ${subject?.name || 'Mapel tidak diketahui'}`,
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

  return paginateReportRows(Object.values(grouped), query);
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

const getReportByType = async (query, type) => {
  const normalizedType = normalizeReportType(type);
  ensureReportTypeAllowed(query.user, normalizedType);

  if (normalizedType === REPORT_TYPES.global) return getGlobalReport(query);
  if (normalizedType === REPORT_TYPES.students) return getReportByStudent(query);
  if (normalizedType === REPORT_TYPES.rombels) return getReportByRombel(query);
  if (normalizedType === REPORT_TYPES.slots) return getReportByTimeSlot(query);
  if (normalizedType === REPORT_TYPES.daily) return getDailyReport(query);
  if (normalizedType === REPORT_TYPES.monthly) return getMonthlyReport(query);
  if (normalizedType === REPORT_TYPES.semester) return getSemesterReport(query);
  if (normalizedType === REPORT_TYPES.teacherSubject) return getReportByTeacherSubject(query);

  throw serviceError(400, 'Jenis laporan tidak valid');
};

const resolveReportRowsForExport = (type, data) => {
  const normalizedType = normalizeReportType(type);

  if (normalizedType === REPORT_TYPES.global) {
    return [{
      Jenis: 'Global',
      Hadir: data?.summary?.hadir || 0,
      Izin: data?.summary?.izin || 0,
      Sakit: data?.summary?.sakit || 0,
      Alpa: data?.summary?.alpa || 0,
      Total: data?.summary?.total || 0,
      TotalRecords: data?.totalRecords || 0
    }];
  }

  const rawRows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
  return rawRows.map((row) => {
    const mapped = {};

    if (row.student) {
      mapped.NIS = row.student.nis || '-';
      mapped.Siswa = row.student.name || '-';
    }
    if (row.rombel) {
      mapped.Rombel = row.rombel.name || '-';
    }
    if (row.timeSlot) {
      mapped.Hari = DAY_LABELS[row.timeSlot.dayOfWeek] || row.timeSlot.dayOfWeek || '-';
      mapped.Jam = `${row.timeSlot.startTime || '--:--'} - ${row.timeSlot.endTime || '--:--'}`;
      mapped.Slot = row.timeSlot.label || '-';
    }
    if (row.teacher) {
      mapped.Guru = row.teacher.name || '-';
    }
    if (row.subject) {
      mapped.KodeMapel = row.subject.code || '-';
      mapped.Mapel = row.subject.name || '-';
    }
    if (row.date) {
      mapped.Tanggal = row.date;
    }
    if (row.month) {
      mapped.Bulan = row.month;
    }
    if (row.label && !mapped.Siswa && !mapped.Rombel && !mapped.Guru && !mapped.Tanggal && !mapped.Bulan) {
      mapped.Keterangan = row.label;
    }

    mapped.Hadir = row.hadir || 0;
    mapped.Izin = row.izin || 0;
    mapped.Sakit = row.sakit || 0;
    mapped.Alpa = row.alpa || 0;
    mapped.Total = row.total || 0;
    return mapped;
  });
};

const exportReport = async ({ user, type, dateFrom, dateTo, format }) => {
  const normalizedType = normalizeReportType(type);
  ensureReportTypeAllowed(user, normalizedType);

  const normalizedFormat = String(format || 'xlsx').trim().toLowerCase();
  if (!['xlsx', 'csv'].includes(normalizedFormat)) {
    throw serviceError(400, 'Format export harus xlsx atau csv');
  }

  const data = await getReportByType({
    user,
    dateFrom,
    dateTo,
    all: true
  }, normalizedType);

  const rows = resolveReportRowsForExport(normalizedType, data);
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Tidak ada data' }]);
  const dateRangeLabel = `${dateFrom || 'all'}_${dateTo || 'all'}`;
  const filename = `laporan-${normalizedType}-${dateRangeLabel}.${normalizedFormat}`;

  if (normalizedFormat === 'csv') {
    const csvText = XLSX.utils.sheet_to_csv(worksheet);
    return {
      filename,
      mimeType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(csvText, 'utf8')
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
  const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return {
    filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: fileBuffer
  };
};

module.exports = {
  exportReport,
  getDailyReport,
  getGlobalReport,
  getMonthlyReport,
  getReportByDateRange,
  getReportByRombel,
  getReportByStudent,
  getReportByTeacherSubject,
  getReportByTimeSlot,
  getSemesterReport
};
