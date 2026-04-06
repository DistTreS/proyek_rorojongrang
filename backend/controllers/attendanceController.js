const {
  createAttendance,
  createAttendanceMeeting,
  deleteAttendance,
  deleteAttendanceMeeting,
  getAttendanceMeetingDetail,
  getAttendanceSummary,
  listAttendance,
  listAttendanceManualOptions,
  listAttendanceMeetingSlots,
  listAttendanceMeetings,
  updateAttendance,
  updateAttendanceMeetingEntries,
  uploadAttendanceMeetingAttachment
} = require('../services/attendanceService');
const { handleControllerError } = require('../utils/controllerUtils');

const list = async (req, res) => {
  try {
    const data = await listAttendance({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat presensi');
  }
};

const create = async (req, res) => {
  try {
    const data = await createAttendance({ user: req.user, payload: req.body });
    return res.status(201).json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal membuat presensi');
  }
};

const listMeetings = async (req, res) => {
  try {
    const data = await listAttendanceMeetings({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat pertemuan presensi');
  }
};

const listMeetingSlots = async (req, res) => {
  try {
    const data = await listAttendanceMeetingSlots({
      date: req.query.date,
      rombelId: req.query.rombelId
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat opsi jam pertemuan');
  }
};

const listManualOptions = async (req, res) => {
  try {
    const data = await listAttendanceManualOptions({ user: req.user });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat opsi pertemuan manual');
  }
};

const detailMeeting = async (req, res) => {
  try {
    const data = await getAttendanceMeetingDetail({ user: req.user, meetingId: req.params.meetingId });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat detail pertemuan');
  }
};

const createMeeting = async (req, res) => {
  try {
    const data = await createAttendanceMeeting({ user: req.user, payload: req.body });
    return res.status(201).json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal membuat pertemuan');
  }
};

const updateMeetingEntries = async (req, res) => {
  try {
    const data = await updateAttendanceMeetingEntries({
      user: req.user,
      meetingId: req.params.meetingId,
      entries: req.body.entries
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memperbarui presensi');
  }
};

const uploadMeetingAttachment = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File tidak ditemukan' });
  }

  try {
    const data = await uploadAttendanceMeetingAttachment({
      user: req.user,
      meetingId: req.params.meetingId,
      studentId: req.params.studentId,
      attachmentUrl: `/uploads/attendance/${req.file.filename}`
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal upload lampiran');
  }
};

const deleteMeeting = async (req, res) => {
  try {
    const data = await deleteAttendanceMeeting({ user: req.user, meetingId: req.params.meetingId });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menghapus pertemuan');
  }
};

const update = async (req, res) => {
  try {
    const data = await updateAttendance({
      user: req.user,
      id: req.params.id,
      payload: req.body
    });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memperbarui presensi');
  }
};

const remove = async (req, res) => {
  try {
    const data = await deleteAttendance({ user: req.user, id: req.params.id });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal menghapus presensi');
  }
};

const summary = async (req, res) => {
  try {
    const data = await getAttendanceSummary({ user: req.user, ...req.query });
    return res.json(data);
  } catch (err) {
    return handleControllerError(res, err, 'Gagal memuat ringkasan presensi');
  }
};

module.exports = {
  list,
  listManualOptions,
  listMeetingSlots,
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
