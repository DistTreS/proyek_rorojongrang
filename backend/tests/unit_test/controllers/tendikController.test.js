/**
 * tests/unit_test/controllers/tendikController.test.js
 *
 * Unit test untuk tendikController.
 * Menguji: list, detail, create, update, remove, importExcel, downloadTemplate.
 */

'use strict';

jest.mock('../../../services/tendikService');

const tendikService    = require('../../../services/tendikService');
const tendikController = require('../../../controllers/tendikController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeServiceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const TENDIK_FIXTURE = {
  id: 1,
  name: 'Budi Santoso',
  nip: '198001010001',
  position: 'Guru Matematika',
  user: { id: 2, username: 'budi', email: 'budi@school.id', roles: ['guru'], isActive: true }
};

// ── list ─────────────────────────────────────────────────────────────────────
describe('tendikController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan paginated data', async () => {
    const payload = { items: [TENDIK_FIXTURE], page: 1, totalItems: 1 };
    tendikService.listTendik.mockResolvedValue(payload);

    const req = mockRequest({ query: { page: '1' } });
    const res = mockResponse();

    await tendikController.list(req, res);

    expect(tendikService.listTendik).toHaveBeenCalledWith({ page: '1' });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('service error → 500 fallback', async () => {
    tendikService.listTendik.mockRejectedValue(new Error('Internal'));

    const req = mockRequest();
    const res = mockResponse();

    await tendikController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat data tendik' });
  });
});

// ── detail ────────────────────────────────────────────────────────────────────
describe('tendikController.detail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan detail tendik', async () => {
    tendikService.getTendikDetail.mockResolvedValue(TENDIK_FIXTURE);

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await tendikController.detail(req, res);

    expect(tendikService.getTendikDetail).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith(TENDIK_FIXTURE);
  });

  test('tidak ditemukan → 404', async () => {
    tendikService.getTendikDetail.mockRejectedValue(makeServiceError(404, 'Tendik tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' } });
    const res = mockResponse();

    await tendikController.detail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Tendik tidak ditemukan' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('tendikController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → 201 dengan data tendik baru', async () => {
    tendikService.createTendik.mockResolvedValue(TENDIK_FIXTURE);

    const body = { username: 'budi', email: 'budi@s.id', password: 'pass123', name: 'Budi', roles: ['guru'] };
    const req  = mockRequest({ body });
    const res  = mockResponse();

    await tendikController.create(req, res);

    expect(tendikService.createTendik).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(TENDIK_FIXTURE);
  });

  test('email duplikat → 409', async () => {
    tendikService.createTendik.mockRejectedValue(makeServiceError(409, 'Email sudah digunakan'));

    const req = mockRequest({ body: { email: 'dup@s.id' } });
    const res = mockResponse();

    await tendikController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('validasi gagal → 400', async () => {
    tendikService.createTendik.mockRejectedValue(makeServiceError(400, 'Nama wajib diisi'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await tendikController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('tendikController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan data terbaru', async () => {
    const updated = { ...TENDIK_FIXTURE, name: 'Budi S. Updated' };
    tendikService.updateTendik.mockResolvedValue(updated);

    const req = mockRequest({ params: { id: '1' }, body: { name: 'Budi S. Updated' } });
    const res = mockResponse();

    await tendikController.update(req, res);

    expect(tendikService.updateTendik).toHaveBeenCalledWith('1', { name: 'Budi S. Updated' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('tidak ditemukan → 404', async () => {
    tendikService.updateTendik.mockRejectedValue(makeServiceError(404, 'Tendik tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' }, body: {} });
    const res = mockResponse();

    await tendikController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('tendikController.remove', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan pesan sukses', async () => {
    tendikService.deleteTendik.mockResolvedValue({ message: 'Tendik dihapus' });

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await tendikController.remove(req, res);

    expect(tendikService.deleteTendik).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith({ message: 'Tendik dihapus' });
  });

  test('error unknown → 500', async () => {
    tendikService.deleteTendik.mockRejectedValue(new Error('Unexpected'));

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await tendikController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus tendik' });
  });
});

// ── importExcel ───────────────────────────────────────────────────────────────
describe('tendikController.importExcel', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tanpa file → 400 "File wajib diunggah"', async () => {
    const req = mockRequest({ file: null });
    const res = mockResponse();

    await tendikController.importExcel(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'File wajib diunggah' });
    expect(tendikService.importTendik).not.toHaveBeenCalled();
  });

  test('dengan file → service dipanggil dan hasil dikembalikan', async () => {
    const importResult = { inserted: 3, skipped: 1, errors: [] };
    tendikService.importTendik.mockResolvedValue(importResult);

    const fakeBuffer = Buffer.from('fake-xlsx');
    const req = mockRequest({ file: { buffer: fakeBuffer } });
    const res = mockResponse();

    await tendikController.importExcel(req, res);

    expect(tendikService.importTendik).toHaveBeenCalledWith(fakeBuffer);
    expect(res.json).toHaveBeenCalledWith(importResult);
  });

  test('service gagal import → 500', async () => {
    tendikService.importTendik.mockRejectedValue(new Error('Parse error'));

    const req = mockRequest({ file: { buffer: Buffer.from('bad') } });
    const res = mockResponse();

    await tendikController.importExcel(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── downloadTemplate ──────────────────────────────────────────────────────────
describe('tendikController.downloadTemplate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('mengembalikan file xlsx dengan header yang tepat', async () => {
    const fakeBuffer = Buffer.from('fake-xlsx-template');
    tendikService.getTendikTemplateBuffer.mockReturnValue(fakeBuffer);

    const req = mockRequest();
    const res = mockResponse();

    await tendikController.downloadTemplate(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="template-tendik.xlsx"');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });
});
