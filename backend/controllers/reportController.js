const {
  getDailyReport,
  getGlobalReport,
  getMonthlyReport,
  getReportByDateRange,
  getReportByRombel,
  getReportByStudent,
  getReportByTimeSlot,
  getSemesterReport
} = require('../services/reportService');
const { handleControllerError } = require('../utils/controllerUtils');

const globalReport = async (req, res) => {
  try {
    const data = await getGlobalReport({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan global');
  }
};

const reportByStudent = async (req, res) => {
  try {
    const data = await getReportByStudent({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan siswa');
  }
};

const reportByRombel = async (req, res) => {
  try {
    const data = await getReportByRombel({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan rombel');
  }
};

const reportByTimeSlot = async (req, res) => {
  try {
    const data = await getReportByTimeSlot({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan slot');
  }
};

const reportDaily = async (req, res) => {
  try {
    const data = await getDailyReport({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan harian');
  }
};

const reportMonthly = async (req, res) => {
  try {
    const data = await getMonthlyReport({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan bulanan');
  }
};

const reportSemester = async (req, res) => {
  try {
    const data = await getSemesterReport({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan semester');
  }
};

const reportByDateRange = async (req, res) => {
  try {
    const data = await getReportByDateRange({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat laporan rentang tanggal');
  }
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
