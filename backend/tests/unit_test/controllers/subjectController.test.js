/**
 * tests/unit_test/controllers/subjectController.test.js
 *
 * Unit test untuk subjectController (Mata Pelajaran).
 * Menguji: list, detail, create, update, remove.
 */

'use strict';

jest.mock('../../../services/subjectService');

const subjectService    = require('../../../services/subjectService');
const subjectController = require('../../../controllers/subjectController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeServiceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const SUBJECT_FIXTURE = {
  id: 1, code: 'MTK', name: 'Matematika', type: 'wajib', periodId: 1
};

// ── list ─────────────────────────────────────────────────────────────────────
describe('subjectController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan paginated list', async () => {
    const payload = { items: [SUBJECT_FIXTURE], page: 1, totalItems: 1 };
    subjectService.listSubjects.mockResolvedValue(payload);

    const req = mockRequest({ query: { periodId: '1' } });
    const res = mockResponse();

    await subjectController.list(req, res);

    expect(subjectService.listSubjects).toHaveBeenCalledWith({ periodId: '1' });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('service error → 500', async () => {
    subjectService.listSubjects.mockRejectedValue(new Error('DB error'));

    const req = mockRequest();
    const res = mockResponse();

    await subjectController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat mata pelajaran' });
  });
});

// ── detail ────────────────────────────────────────────────────────────────────
describe('subjectController.detail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json', async () => {
    subjectService.getSubjectDetail.mockResolvedValue(SUBJECT_FIXTURE);

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await subjectController.detail(req, res);

    expect(subjectService.getSubjectDetail).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith(SUBJECT_FIXTURE);
  });

  test('tidak ditemukan → 404', async () => {
    subjectService.getSubjectDetail.mockRejectedValue(makeServiceError(404, 'Mapel tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' } });
    const res = mockResponse();

    await subjectController.detail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Mapel tidak ditemukan' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('subjectController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → 201 + data baru', async () => {
    subjectService.createSubject.mockResolvedValue(SUBJECT_FIXTURE);

    const body = { name: 'Matematika', code: 'MTK', type: 'wajib', periodId: 1 };
    const req  = mockRequest({ body });
    const res  = mockResponse();

    await subjectController.create(req, res);

    expect(subjectService.createSubject).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(SUBJECT_FIXTURE);
  });

  test('nama duplikat dalam periode → 409', async () => {
    subjectService.createSubject.mockRejectedValue(makeServiceError(409, 'Nama mapel sudah digunakan'));

    const req = mockRequest({ body: { name: 'Matematika', periodId: 1 } });
    const res = mockResponse();

    await subjectController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('validasi gagal (nama kosong) → 400', async () => {
    subjectService.createSubject.mockRejectedValue(makeServiceError(400, 'Nama mapel wajib diisi'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await subjectController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Nama mapel wajib diisi' });
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('subjectController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json data updated', async () => {
    const updated = { ...SUBJECT_FIXTURE, name: 'Matematika Lanjut' };
    subjectService.updateSubject.mockResolvedValue(updated);

    const req = mockRequest({ params: { id: '1' }, body: { name: 'Matematika Lanjut' } });
    const res = mockResponse();

    await subjectController.update(req, res);

    expect(subjectService.updateSubject).toHaveBeenCalledWith('1', { name: 'Matematika Lanjut' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('tidak ditemukan → 404', async () => {
    subjectService.updateSubject.mockRejectedValue(makeServiceError(404, 'Mapel tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' }, body: {} });
    const res = mockResponse();

    await subjectController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('subjectController.remove', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json pesan sukses', async () => {
    subjectService.deleteSubject.mockResolvedValue({ message: 'Mapel dihapus' });

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await subjectController.remove(req, res);

    expect(subjectService.deleteSubject).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith({ message: 'Mapel dihapus' });
  });

  test('mapel dipakai di pengampu → 409', async () => {
    subjectService.deleteSubject.mockRejectedValue(
      makeServiceError(409, 'Mapel tidak bisa dihapus karena sudah dipakai')
    );

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await subjectController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Mapel tidak bisa dihapus karena sudah dipakai' });
  });

  test('error unknown → 500', async () => {
    subjectService.deleteSubject.mockRejectedValue(new Error('Unexpected'));

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await subjectController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus mata pelajaran' });
  });
});
