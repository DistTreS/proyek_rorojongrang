/**
 * tests/unit_test/controllers/teachingAssignmentController.test.js
 */

'use strict';

jest.mock('../../../services/teachingAssignmentService');

const teachingAssignmentService    = require('../../../services/teachingAssignmentService');
const teachingAssignmentController = require('../../../controllers/teachingAssignmentController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const ASSIGN_FIXTURE = { id: 1, teacherId: 1, subjectId: 2, rombelId: 3, periodId: 1 };

describe('teachingAssignmentController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teachingAssignmentService.listTeachingAssignments.mockResolvedValue([ASSIGN_FIXTURE]);
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await teachingAssignmentController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([ASSIGN_FIXTURE]);
  });
  test('known error → err.status', async () => {
    teachingAssignmentService.listTeachingAssignments.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest();
    const res = mockResponse();
    await teachingAssignmentController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  test('unknown error → 500', async () => {
    teachingAssignmentService.listTeachingAssignments.mockRejectedValue(new Error('err'));
    const req = mockRequest();
    const res = mockResponse();
    await teachingAssignmentController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat pengampu mapel' });
  });
});

describe('teachingAssignmentController.detail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teachingAssignmentService.getTeachingAssignmentDetail.mockResolvedValue(ASSIGN_FIXTURE);
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teachingAssignmentController.detail(req, res);
    expect(res.json).toHaveBeenCalledWith(ASSIGN_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    teachingAssignmentService.getTeachingAssignmentDetail.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await teachingAssignmentController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teachingAssignmentService.getTeachingAssignmentDetail.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teachingAssignmentController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat detail pengampu mapel' });
  });
});

describe('teachingAssignmentController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    teachingAssignmentService.createTeachingAssignment.mockResolvedValue(ASSIGN_FIXTURE);
    const req = mockRequest({ body: { teacherId: 1, subjectId: 2 } });
    const res = mockResponse();
    await teachingAssignmentController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(ASSIGN_FIXTURE);
  });
  test('error validasi → 400', async () => {
    teachingAssignmentService.createTeachingAssignment.mockRejectedValue(makeError(400, 'Wajib diisi'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await teachingAssignmentController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('unknown error → 500', async () => {
    teachingAssignmentService.createTeachingAssignment.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await teachingAssignmentController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat pengampu mapel' });
  });
});

describe('teachingAssignmentController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teachingAssignmentService.updateTeachingAssignment.mockResolvedValue(ASSIGN_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await teachingAssignmentController.update(req, res);
    expect(res.json).toHaveBeenCalledWith(ASSIGN_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    teachingAssignmentService.updateTeachingAssignment.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {} });
    const res = mockResponse();
    await teachingAssignmentController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teachingAssignmentService.updateTeachingAssignment.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await teachingAssignmentController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui pengampu mapel' });
  });
});

describe('teachingAssignmentController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    teachingAssignmentService.deleteTeachingAssignment.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teachingAssignmentController.remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('tidak ditemukan → 404', async () => {
    teachingAssignmentService.deleteTeachingAssignment.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await teachingAssignmentController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    teachingAssignmentService.deleteTeachingAssignment.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await teachingAssignmentController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus pengampu mapel' });
  });
});
