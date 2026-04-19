/**
 * tests/unit_test/controllers/teacherPreferenceController.test.js
 */

'use strict';

jest.mock('../../../services/teacherPreferenceService');

const teacherPreferenceService    = require('../../../services/teacherPreferenceService');
const teacherPreferenceController = require('../../../controllers/teacherPreferenceController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const PREF_FIXTURE = { id: 1, teacherId: 1, timeSlotId: 2, preference: 'unavailable' };

describe('teacherPreferenceController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teacherPreferenceService.listTeacherPreferences.mockResolvedValue([PREF_FIXTURE]);
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await teacherPreferenceController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([PREF_FIXTURE]);
  });
  test('error → 500', async () => {
    teacherPreferenceService.listTeacherPreferences.mockRejectedValue(new Error('err'));
    const req = mockRequest();
    const res = mockResponse();
    await teacherPreferenceController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat preferensi guru' });
  });
  test('known error → err.status', async () => {
    teacherPreferenceService.listTeacherPreferences.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest();
    const res = mockResponse();
    await teacherPreferenceController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('teacherPreferenceController.detail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teacherPreferenceService.getTeacherPreferenceDetail.mockResolvedValue(PREF_FIXTURE);
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teacherPreferenceController.detail(req, res);
    expect(res.json).toHaveBeenCalledWith(PREF_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    teacherPreferenceService.getTeacherPreferenceDetail.mockRejectedValue(makeError(404, 'Tidak ada'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await teacherPreferenceController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teacherPreferenceService.getTeacherPreferenceDetail.mockRejectedValue(new Error('fail'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teacherPreferenceController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat detail preferensi guru' });
  });
});

describe('teacherPreferenceController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    teacherPreferenceService.createTeacherPreference.mockResolvedValue(PREF_FIXTURE);
    const req = mockRequest({ body: { teacherId: 1, timeSlotId: 2 } });
    const res = mockResponse();
    await teacherPreferenceController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(PREF_FIXTURE);
  });
  test('error validasi → 400', async () => {
    teacherPreferenceService.createTeacherPreference.mockRejectedValue(makeError(400, 'Invalid'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await teacherPreferenceController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('unknown error → 500', async () => {
    teacherPreferenceService.createTeacherPreference.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await teacherPreferenceController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat preferensi guru' });
  });
});

describe('teacherPreferenceController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teacherPreferenceService.updateTeacherPreference.mockResolvedValue(PREF_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await teacherPreferenceController.update(req, res);
    expect(res.json).toHaveBeenCalledWith(PREF_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    teacherPreferenceService.updateTeacherPreference.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {} });
    const res = mockResponse();
    await teacherPreferenceController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teacherPreferenceService.updateTeacherPreference.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await teacherPreferenceController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui preferensi guru' });
  });
});

describe('teacherPreferenceController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teacherPreferenceService.deleteTeacherPreference.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teacherPreferenceController.remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('tidak ditemukan → 404', async () => {
    teacherPreferenceService.deleteTeacherPreference.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await teacherPreferenceController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teacherPreferenceService.deleteTeacherPreference.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teacherPreferenceController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus preferensi guru' });
  });
});
