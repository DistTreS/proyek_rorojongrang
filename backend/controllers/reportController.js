const { Op } = require('sequelize');
const { Attendance, Student, Rombel, TimeSlot } = require('../models');

const summarize = (rows, key) => {
  return rows.reduce((acc, row) => {
    const value = row[key];
    if (!value) return acc;
    if (!acc[value]) {
      acc[value] = { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
    }
    acc[value][row.status] = (acc[value][row.status] || 0) + 1;
    acc[value].total += 1;
    return acc;
  }, {});
};

const parseRange = (req) => {
  const { dateFrom, dateTo } = req.query;
  if (!dateFrom || !dateTo) {
    return { error: 'dateFrom dan dateTo wajib diisi' };
  }
  return { dateFrom, dateTo };
};

const fetchRows = async (where) => {
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

const globalReport = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

  const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
  rows.forEach((row) => {
    summary[row.status] += 1;
    summary.total += 1;
  });

  return res.json({ summary, totalRecords: rows.length });
};

const reportByStudent = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

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

  return res.json(Object.values(grouped));
};

const reportByRombel = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

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

  return res.json(Object.values(grouped));
};

const reportByTimeSlot = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

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

  return res.json(Object.values(grouped));
};

const reportDaily = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

  const grouped = rows.reduce((acc, row) => {
    const date = row.date;
    if (!acc[date]) {
      acc[date] = { date, hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
    }
    acc[date][row.status] += 1;
    acc[date].total += 1;
    return acc;
  }, {});

  return res.json(Object.values(grouped));
};

const reportMonthly = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

  const grouped = rows.reduce((acc, row) => {
    const month = row.date.slice(0, 7);
    if (!acc[month]) {
      acc[month] = { month, hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 };
    }
    acc[month][row.status] += 1;
    acc[month].total += 1;
    return acc;
  }, {});

  return res.json(Object.values(grouped));
};

const reportSemester = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

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

  return res.json(Object.values(grouped));
};

const reportByDateRange = async (req, res) => {
  const { error, dateFrom, dateTo } = parseRange(req);
  if (error) return res.status(400).json({ message: error });

  const rows = await fetchRows({
    date: { [Op.between]: [dateFrom, dateTo] }
  });

  return res.json({
    dateFrom,
    dateTo,
    totalRecords: rows.length
  });
};

module.exports = {
  globalReport,
  reportByStudent,
  reportByRombel,
  reportByTimeSlot,
  reportDaily,
  reportMonthly,
  reportSemester,
  reportByDateRange
};
