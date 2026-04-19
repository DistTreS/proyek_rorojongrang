/**
 * tests/unit_test/controllers/timeSlotController.test.js
 */

'use strict';

jest.mock('../../../services/timeSlotService');

const timeSlotService    = require('../../../services/timeSlotService');
const timeSlotController = require('../../../controllers/timeSlotController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const SLOT_FIXTURE = { id: 1, startTime: '07:00', endTime: '07:45', dayOfWeek: 1 };

describe('timeSlotController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    timeSlotService.listTimeSlots.mockResolvedValue([SLOT_FIXTURE]);
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await timeSlotController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([SLOT_FIXTURE]);
  });
  test('known error → err.status', async () => {
    timeSlotService.listTimeSlots.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest();
    const res = mockResponse();
    await timeSlotController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  test('unknown error → 500', async () => {
    timeSlotService.listTimeSlots.mockRejectedValue(new Error('err'));
    const req = mockRequest();
    const res = mockResponse();
    await timeSlotController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat jam pelajaran' });
  });
});

describe('timeSlotController.detail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    timeSlotService.getTimeSlotDetail.mockResolvedValue(SLOT_FIXTURE);
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await timeSlotController.detail(req, res);
    expect(res.json).toHaveBeenCalledWith(SLOT_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    timeSlotService.getTimeSlotDetail.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await timeSlotController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    timeSlotService.getTimeSlotDetail.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await timeSlotController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat detail jam pelajaran' });
  });
});

describe('timeSlotController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    timeSlotService.createTimeSlot.mockResolvedValue(SLOT_FIXTURE);
    const req = mockRequest({ body: { startTime: '07:00', endTime: '07:45', dayOfWeek: 1 } });
    const res = mockResponse();
    await timeSlotController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SLOT_FIXTURE);
  });
  test('konflik waktu → 409', async () => {
    timeSlotService.createTimeSlot.mockRejectedValue(makeError(409, 'Konflik waktu'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await timeSlotController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('unknown error → 500', async () => {
    timeSlotService.createTimeSlot.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await timeSlotController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat jam pelajaran' });
  });
});

describe('timeSlotController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    timeSlotService.updateTimeSlot.mockResolvedValue(SLOT_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await timeSlotController.update(req, res);
    expect(res.json).toHaveBeenCalledWith(SLOT_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    timeSlotService.updateTimeSlot.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {} });
    const res = mockResponse();
    await timeSlotController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    timeSlotService.updateTimeSlot.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await timeSlotController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui jam pelajaran' });
  });
});

describe('timeSlotController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    timeSlotService.deleteTimeSlot.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await timeSlotController.remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('tidak ditemukan → 404', async () => {
    timeSlotService.deleteTimeSlot.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await timeSlotController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    timeSlotService.deleteTimeSlot.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await timeSlotController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus jam pelajaran' });
  });
});
