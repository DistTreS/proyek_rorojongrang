/**
 * tests/unit_test/controllers/attendanceController.test.js
 * Mock attendanceService dan controllerUtils
 */

'use strict';

jest.mock('../../../services/attendanceService');
jest.mock('../../../utils/controllerUtils');

const attendanceService    = require('../../../services/attendanceService');
const controllerUtils      = require('../../../utils/controllerUtils');
const attendanceController = require('../../../controllers/attendanceController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

controllerUtils.handleControllerError.mockImplementation((res, err, fallback) => {
  if (err?.status) return res.status(err.status).json({ message: err.message });
  return res.status(500).json({ message: fallback });
});

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const USER = { id: 1, roles: ['guru'] };

// ── list ─────────────────────────────────────────────────────────────────────
describe('attendanceController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.listAttendance.mockResolvedValue([]);
    const req = mockRequest({ query: { date: '2024-08-17' }, user: USER });
    const res = mockResponse();
    await attendanceController.list(req, res);
    expect(attendanceService.listAttendance).toHaveBeenCalledWith({ date: '2024-08-17', user: USER });
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    attendanceService.listAttendance.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat presensi' });
  });
  test('known error → err.status', async () => {
    attendanceService.listAttendance.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('attendanceController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    attendanceService.createAttendance.mockResolvedValue({ id: 1 });
    const req = mockRequest({ body: { meetingId: 'abc' }, user: USER });
    const res = mockResponse();
    await attendanceController.create(req, res);
    expect(attendanceService.createAttendance).toHaveBeenCalledWith({ user: USER, payload: { meetingId: 'abc' } });
    expect(res.status).toHaveBeenCalledWith(201);
  });
  test('error → 500', async () => {
    attendanceService.createAttendance.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {}, user: USER });
    const res = mockResponse();
    await attendanceController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat presensi' });
  });
});

// ── listMeetings ──────────────────────────────────────────────────────────────
describe('attendanceController.listMeetings', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.listAttendanceMeetings.mockResolvedValue([]);
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.listMeetings(req, res);
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    attendanceService.listAttendanceMeetings.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.listMeetings(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat pertemuan presensi' });
  });
});

// ── listMeetingSlots ──────────────────────────────────────────────────────────
describe('attendanceController.listMeetingSlots', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.listAttendanceMeetingSlots.mockResolvedValue([]);
    const req = mockRequest({ query: { date: '2024-08-17', rombelId: '1' } });
    const res = mockResponse();
    await attendanceController.listMeetingSlots(req, res);
    expect(attendanceService.listAttendanceMeetingSlots).toHaveBeenCalledWith({ date: '2024-08-17', rombelId: '1' });
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    attendanceService.listAttendanceMeetingSlots.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.listMeetingSlots(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat opsi jam pertemuan' });
  });
});

// ── listManualOptions ─────────────────────────────────────────────────────────
describe('attendanceController.listManualOptions', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.listAttendanceManualOptions.mockResolvedValue([]);
    const req = mockRequest({ user: USER });
    const res = mockResponse();
    await attendanceController.listManualOptions(req, res);
    expect(attendanceService.listAttendanceManualOptions).toHaveBeenCalledWith({ user: USER });
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    attendanceService.listAttendanceManualOptions.mockRejectedValue(new Error('err'));
    const req = mockRequest({ user: USER });
    const res = mockResponse();
    await attendanceController.listManualOptions(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat opsi pertemuan manual' });
  });
});

// ── detailMeeting ─────────────────────────────────────────────────────────────
describe('attendanceController.detailMeeting', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.getAttendanceMeetingDetail.mockResolvedValue({ meetingId: 'abc' });
    const req = mockRequest({ params: { meetingId: 'abc' }, user: USER });
    const res = mockResponse();
    await attendanceController.detailMeeting(req, res);
    expect(attendanceService.getAttendanceMeetingDetail).toHaveBeenCalledWith({ user: USER, meetingId: 'abc' });
    expect(res.json).toHaveBeenCalledWith({ meetingId: 'abc' });
  });
  test('tidak ditemukan → 404', async () => {
    attendanceService.getAttendanceMeetingDetail.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { meetingId: 'xyz' }, user: USER });
    const res = mockResponse();
    await attendanceController.detailMeeting(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── createMeeting ─────────────────────────────────────────────────────────────
describe('attendanceController.createMeeting', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    attendanceService.createAttendanceMeeting.mockResolvedValue({ meetingId: 'new' });
    const req = mockRequest({ body: { rombelId: 1 }, user: USER });
    const res = mockResponse();
    await attendanceController.createMeeting(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
  test('error → 500', async () => {
    attendanceService.createAttendanceMeeting.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {}, user: USER });
    const res = mockResponse();
    await attendanceController.createMeeting(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat pertemuan' });
  });
});

// ── updateMeetingEntries ──────────────────────────────────────────────────────
describe('attendanceController.updateMeetingEntries', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.updateAttendanceMeetingEntries.mockResolvedValue({ updated: 3 });
    const req = mockRequest({ params: { meetingId: 'abc' }, body: { entries: [] }, user: USER });
    const res = mockResponse();
    await attendanceController.updateMeetingEntries(req, res);
    expect(attendanceService.updateAttendanceMeetingEntries).toHaveBeenCalledWith({
      user: USER, meetingId: 'abc', entries: []
    });
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });
  test('error → 500', async () => {
    attendanceService.updateAttendanceMeetingEntries.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { meetingId: 'abc' }, body: {}, user: USER });
    const res = mockResponse();
    await attendanceController.updateMeetingEntries(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui presensi' });
  });
});

// ── uploadMeetingAttachment ───────────────────────────────────────────────────
describe('attendanceController.uploadMeetingAttachment', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tanpa file → 400', async () => {
    const req = mockRequest({ file: null, params: { meetingId: 'abc', studentId: '1' }, user: USER });
    const res = mockResponse();
    await attendanceController.uploadMeetingAttachment(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'File tidak ditemukan' });
    expect(attendanceService.uploadAttendanceMeetingAttachment).not.toHaveBeenCalled();
  });

  test('dengan file → service dipanggil dan res.json', async () => {
    attendanceService.uploadAttendanceMeetingAttachment.mockResolvedValue({ attachmentUrl: '/uploads/att/x.jpg' });
    const req = mockRequest({
      file: { filename: 'x.jpg' },
      params: { meetingId: 'abc', studentId: '1' },
      user: USER
    });
    const res = mockResponse();
    await attendanceController.uploadMeetingAttachment(req, res);
    expect(attendanceService.uploadAttendanceMeetingAttachment).toHaveBeenCalledWith({
      user: USER, meetingId: 'abc', studentId: '1',
      attachmentUrl: '/uploads/attendance/x.jpg'
    });
    expect(res.json).toHaveBeenCalledWith({ attachmentUrl: '/uploads/att/x.jpg' });
  });

  test('service error → 500', async () => {
    attendanceService.uploadAttendanceMeetingAttachment.mockRejectedValue(new Error('err'));
    const req = mockRequest({
      file: { filename: 'y.jpg' },
      params: { meetingId: 'abc', studentId: '1' },
      user: USER
    });
    const res = mockResponse();
    await attendanceController.uploadMeetingAttachment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal upload lampiran' });
  });
});

// ── deleteMeeting ─────────────────────────────────────────────────────────────
describe('attendanceController.deleteMeeting', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.deleteAttendanceMeeting.mockResolvedValue({ message: 'Pertemuan dihapus' });
    const req = mockRequest({ params: { meetingId: 'abc' }, user: USER });
    const res = mockResponse();
    await attendanceController.deleteMeeting(req, res);
    expect(attendanceService.deleteAttendanceMeeting).toHaveBeenCalledWith({ user: USER, meetingId: 'abc' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Pertemuan dihapus' });
  });
  test('error → 500', async () => {
    attendanceService.deleteAttendanceMeeting.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { meetingId: 'abc' }, user: USER });
    const res = mockResponse();
    await attendanceController.deleteMeeting(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus pertemuan' });
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('attendanceController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.updateAttendance.mockResolvedValue({ id: 1, status: 'hadir' });
    const req = mockRequest({ params: { id: '1' }, body: { status: 'hadir' }, user: USER });
    const res = mockResponse();
    await attendanceController.update(req, res);
    expect(attendanceService.updateAttendance).toHaveBeenCalledWith({ user: USER, id: '1', payload: { status: 'hadir' } });
    expect(res.json).toHaveBeenCalledWith({ id: 1, status: 'hadir' });
  });
  test('error → 500', async () => {
    attendanceService.updateAttendance.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {}, user: USER });
    const res = mockResponse();
    await attendanceController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui presensi' });
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('attendanceController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.deleteAttendance.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' }, user: USER });
    const res = mockResponse();
    await attendanceController.remove(req, res);
    expect(attendanceService.deleteAttendance).toHaveBeenCalledWith({ user: USER, id: '1' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('error → 500', async () => {
    attendanceService.deleteAttendance.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, user: USER });
    const res = mockResponse();
    await attendanceController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus presensi' });
  });
});

// ── summary ──────────────────────────────────────────────────────────────────
describe('attendanceController.summary', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    attendanceService.getAttendanceSummary.mockResolvedValue({ hadir: 10 });
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.summary(req, res);
    expect(res.json).toHaveBeenCalledWith({ hadir: 10 });
  });
  test('error → 500', async () => {
    attendanceService.getAttendanceSummary.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await attendanceController.summary(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat ringkasan presensi' });
  });
});
