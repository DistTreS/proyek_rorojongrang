/**
 * tests/unit_test/controllers/academicPeriodController.test.js
 */

'use strict';

jest.mock('../../../services/academicPeriodService');

const academicPeriodService    = require('../../../services/academicPeriodService');
const academicPeriodController = require('../../../controllers/academicPeriodController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const PERIOD_FIXTURE = { id: 1, name: '2024/2025 Ganjil', isActive: true };

describe('academicPeriodController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    academicPeriodService.listAcademicPeriods.mockResolvedValue([PERIOD_FIXTURE]);
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await academicPeriodController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([PERIOD_FIXTURE]);
  });
  test('error → 500', async () => {
    academicPeriodService.listAcademicPeriods.mockRejectedValue(new Error('fail'));
    const req = mockRequest();
    const res = mockResponse();
    await academicPeriodController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat periode' });
  });
  test('known error → err.status', async () => {
    academicPeriodService.listAcademicPeriods.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest();
    const res = mockResponse();
    await academicPeriodController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('academicPeriodController.detail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    academicPeriodService.getAcademicPeriodDetail.mockResolvedValue(PERIOD_FIXTURE);
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await academicPeriodController.detail(req, res);
    expect(res.json).toHaveBeenCalledWith(PERIOD_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    academicPeriodService.getAcademicPeriodDetail.mockRejectedValue(makeError(404, 'Tidak ditemukan'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await academicPeriodController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    academicPeriodService.getAcademicPeriodDetail.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await academicPeriodController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat detail periode' });
  });
});

describe('academicPeriodController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    academicPeriodService.createAcademicPeriod.mockResolvedValue(PERIOD_FIXTURE);
    const req = mockRequest({ body: { name: '2024/2025 Ganjil' } });
    const res = mockResponse();
    await academicPeriodController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(PERIOD_FIXTURE);
  });
  test('validasi gagal → 400', async () => {
    academicPeriodService.createAcademicPeriod.mockRejectedValue(makeError(400, 'Nama wajib'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await academicPeriodController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('unknown error → 500', async () => {
    academicPeriodService.createAcademicPeriod.mockRejectedValue(new Error('fail'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await academicPeriodController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat periode' });
  });
});

describe('academicPeriodController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    academicPeriodService.updateAcademicPeriod.mockResolvedValue(PERIOD_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: { name: 'Updated' } });
    const res = mockResponse();
    await academicPeriodController.update(req, res);
    expect(res.json).toHaveBeenCalledWith(PERIOD_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    academicPeriodService.updateAcademicPeriod.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {} });
    const res = mockResponse();
    await academicPeriodController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    academicPeriodService.updateAcademicPeriod.mockRejectedValue(new Error('fail'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await academicPeriodController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui periode' });
  });
});

describe('academicPeriodController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    academicPeriodService.deleteAcademicPeriod.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await academicPeriodController.remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('dipakai → 409', async () => {
    academicPeriodService.deleteAcademicPeriod.mockRejectedValue(makeError(409, 'Masih dipakai'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await academicPeriodController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('unknown error → 500', async () => {
    academicPeriodService.deleteAcademicPeriod.mockRejectedValue(new Error('fail'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await academicPeriodController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus periode' });
  });
});
