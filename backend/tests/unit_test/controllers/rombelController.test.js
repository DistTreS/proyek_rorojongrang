/**
 * tests/unit_test/controllers/rombelController.test.js
 *
 * Unit test untuk rombelController.
 * Service layer di-mock sehingga test ini murni menguji logika controller:
 *  - apakah memanggil service yang benar dengan argumen yang tepat
 *  - apakah mengembalikan HTTP status code yang sesuai
 *  - apakah menangani error dengan benar (known error vs unknown error)
 */

'use strict';

jest.mock('../../../services/rombelService');

const rombelService    = require('../../../services/rombelService');
const rombelController = require('../../../controllers/rombelController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

// ── helpers ─────────────────────────────────────────────────────────────────
const makeServiceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const ROMBEL_FIXTURE = {
  id: 1, name: 'X IPA 1', gradeLevel: 10, type: 'utama', periodId: 1
};

// ── list ─────────────────────────────────────────────────────────────────────
describe('rombelController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan data dari service', async () => {
    const payload = { items: [ROMBEL_FIXTURE], page: 1, totalItems: 1 };
    rombelService.listRombels.mockResolvedValue(payload);

    const req = mockRequest({ query: { periodId: '1' }, user: { id: 1 } });
    const res = mockResponse();

    await rombelController.list(req, res);

    expect(rombelService.listRombels).toHaveBeenCalledWith({ periodId: '1', user: { id: 1 } });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('service error → res.status(500).json fallback', async () => {
    rombelService.listRombels.mockRejectedValue(new Error('DB down'));

    const req = mockRequest();
    const res = mockResponse();

    await rombelController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat rombel' });
  });

  test('known service error → res.status(err.status).json(err.message)', async () => {
    rombelService.listRombels.mockRejectedValue(makeServiceError(403, 'Akses ditolak'));

    const req = mockRequest();
    const res = mockResponse();

    await rombelController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Akses ditolak' });
  });
});

// ── detail ────────────────────────────────────────────────────────────────────
describe('rombelController.detail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan data rombel', async () => {
    rombelService.getRombelDetail.mockResolvedValue(ROMBEL_FIXTURE);

    const req = mockRequest({ params: { id: '1' }, user: { id: 5 } });
    const res = mockResponse();

    await rombelController.detail(req, res);

    expect(rombelService.getRombelDetail).toHaveBeenCalledWith('1', { user: { id: 5 } });
    expect(res.json).toHaveBeenCalledWith(ROMBEL_FIXTURE);
  });

  test('rombel tidak ditemukan → 404', async () => {
    rombelService.getRombelDetail.mockRejectedValue(makeServiceError(404, 'Rombel tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' } });
    const res = mockResponse();

    await rombelController.detail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Rombel tidak ditemukan' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('rombelController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.status(201).json dengan data baru', async () => {
    rombelService.createRombel.mockResolvedValue(ROMBEL_FIXTURE);

    const body = { name: 'X IPA 1', gradeLevel: 10, type: 'utama', periodId: 1 };
    const req  = mockRequest({ body });
    const res  = mockResponse();

    await rombelController.create(req, res);

    expect(rombelService.createRombel).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(ROMBEL_FIXTURE);
  });

  test('duplikat nama → 409', async () => {
    rombelService.createRombel.mockRejectedValue(
      makeServiceError(409, 'Nama rombel sudah digunakan pada periode tersebut')
    );

    const req = mockRequest({ body: { name: 'X IPA 1', gradeLevel: 10, type: 'utama', periodId: 1 } });
    const res = mockResponse();

    await rombelController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('validasi gagal → 400', async () => {
    rombelService.createRombel.mockRejectedValue(
      makeServiceError(400, 'Nama rombel wajib diisi')
    );

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await rombelController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Nama rombel wajib diisi' });
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('rombelController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan data terbaru', async () => {
    const updated = { ...ROMBEL_FIXTURE, name: 'X IPA 2' };
    rombelService.updateRombel.mockResolvedValue(updated);

    const req = mockRequest({ params: { id: '1' }, body: { name: 'X IPA 2' } });
    const res = mockResponse();

    await rombelController.update(req, res);

    expect(rombelService.updateRombel).toHaveBeenCalledWith('1', { name: 'X IPA 2' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('tidak ditemukan → 404', async () => {
    rombelService.updateRombel.mockRejectedValue(makeServiceError(404, 'Rombel tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' }, body: {} });
    const res = mockResponse();

    await rombelController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('rombelController.remove', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan pesan sukses', async () => {
    rombelService.deleteRombel.mockResolvedValue({ message: 'Rombel dihapus' });

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await rombelController.remove(req, res);

    expect(rombelService.deleteRombel).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith({ message: 'Rombel dihapus' });
  });

  test('rombel dipakai → 409 tidak bisa dihapus', async () => {
    rombelService.deleteRombel.mockRejectedValue(
      makeServiceError(409, 'Rombel tidak bisa dihapus karena sudah dipakai pada pengampu atau jadwal')
    );

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await rombelController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

// ── assignStudents ────────────────────────────────────────────────────────────
describe('rombelController.assignStudents', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil assign → res.json dengan hasil assign', async () => {
    rombelService.assignStudentsToRombel.mockResolvedValue({ message: 'Siswa berhasil ditambahkan', total: 2 });

    const req = mockRequest({ params: { id: '1' }, body: { studentIds: [10, 11] } });
    const res = mockResponse();

    await rombelController.assignStudents(req, res);

    expect(rombelService.assignStudentsToRombel).toHaveBeenCalledWith('1', [10, 11]);
    expect(res.json).toHaveBeenCalledWith({ message: 'Siswa berhasil ditambahkan', total: 2 });
  });

  test('siswa tidak valid → 400', async () => {
    rombelService.assignStudentsToRombel.mockRejectedValue(makeServiceError(400, 'Siswa tidak valid'));

    const req = mockRequest({ params: { id: '1' }, body: { studentIds: [9999] } });
    const res = mockResponse();

    await rombelController.assignStudents(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── removeStudent ─────────────────────────────────────────────────────────────
describe('rombelController.removeStudent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil hapus siswa dari rombel → res.json', async () => {
    rombelService.removeStudentFromRombel.mockResolvedValue({ message: 'Siswa berhasil dihapus dari rombel' });

    const req = mockRequest({ params: { id: '1', studentId: '10' } });
    const res = mockResponse();

    await rombelController.removeStudent(req, res);

    expect(rombelService.removeStudentFromRombel).toHaveBeenCalledWith('1', '10');
    expect(res.json).toHaveBeenCalledWith({ message: 'Siswa berhasil dihapus dari rombel' });
  });

  test('siswa tidak ditemukan → 404', async () => {
    rombelService.removeStudentFromRombel.mockRejectedValue(makeServiceError(404, 'Siswa tidak ditemukan'));

    const req = mockRequest({ params: { id: '1', studentId: '9999' } });
    const res = mockResponse();

    await rombelController.removeStudent(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
