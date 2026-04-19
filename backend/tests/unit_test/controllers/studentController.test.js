/**
 * tests/unit_test/controllers/studentController.test.js
 *
 * Unit test untuk studentController.
 * Menguji: list, detail, create, update, remove, importExcel, downloadTemplate.
 */

'use strict';

jest.mock('../../../services/studentService');

const studentService    = require('../../../services/studentService');
const studentController = require('../../../controllers/studentController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeServiceError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const STUDENT_FIXTURE = {
  id: 1,
  nis: '2024001',
  name: 'Andi Wicaksono',
  gender: 'L',
  birthDate: '2007-05-14'
};

// ── list ─────────────────────────────────────────────────────────────────────
describe('studentController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan paginated list', async () => {
    const payload = { items: [STUDENT_FIXTURE], page: 1, totalItems: 1 };
    studentService.listStudents.mockResolvedValue(payload);

    const req = mockRequest({ query: { search: 'Andi' }, user: null });
    const res = mockResponse();

    await studentController.list(req, res);

    expect(studentService.listStudents).toHaveBeenCalledWith({ search: 'Andi', user: null });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('service error → 500 fallback', async () => {
    studentService.listStudents.mockRejectedValue(new Error('DB error'));

    const req = mockRequest();
    const res = mockResponse();

    await studentController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat data siswa' });
  });
});

// ── detail ────────────────────────────────────────────────────────────────────
describe('studentController.detail', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan detail siswa', async () => {
    studentService.getStudentDetail.mockResolvedValue(STUDENT_FIXTURE);

    const req = mockRequest({ params: { id: '1' }, user: null });
    const res = mockResponse();

    await studentController.detail(req, res);

    expect(studentService.getStudentDetail).toHaveBeenCalledWith('1', { user: null });
    expect(res.json).toHaveBeenCalledWith(STUDENT_FIXTURE);
  });

  test('siswa tidak ditemukan → 404', async () => {
    studentService.getStudentDetail.mockRejectedValue(makeServiceError(404, 'Siswa tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' } });
    const res = mockResponse();

    await studentController.detail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Siswa tidak ditemukan' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('studentController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → 201 dengan data siswa baru', async () => {
    studentService.createStudent.mockResolvedValue(STUDENT_FIXTURE);

    const body = { nis: '2024001', name: 'Andi Wicaksono', gender: 'L' };
    const req  = mockRequest({ body });
    const res  = mockResponse();

    await studentController.create(req, res);

    expect(studentService.createStudent).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(STUDENT_FIXTURE);
  });

  test('NIS duplikat → 409', async () => {
    studentService.createStudent.mockRejectedValue(makeServiceError(409, 'NIS sudah digunakan'));

    const req = mockRequest({ body: { nis: '2024001' } });
    const res = mockResponse();

    await studentController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'NIS sudah digunakan' });
  });

  test('validasi gagal → 400', async () => {
    studentService.createStudent.mockRejectedValue(makeServiceError(400, 'NIS wajib diisi'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await studentController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('studentController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan data terbaru', async () => {
    const updated = { ...STUDENT_FIXTURE, name: 'Andi W. Updated' };
    studentService.updateStudent.mockResolvedValue(updated);

    const req = mockRequest({ params: { id: '1' }, body: { name: 'Andi W. Updated' } });
    const res = mockResponse();

    await studentController.update(req, res);

    expect(studentService.updateStudent).toHaveBeenCalledWith('1', { name: 'Andi W. Updated' });
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  test('tidak ditemukan → 404', async () => {
    studentService.updateStudent.mockRejectedValue(makeServiceError(404, 'Siswa tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' }, body: {} });
    const res = mockResponse();

    await studentController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('studentController.remove', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json pesan sukses', async () => {
    studentService.deleteStudent.mockResolvedValue({ message: 'Siswa dihapus' });

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await studentController.remove(req, res);

    expect(studentService.deleteStudent).toHaveBeenCalledWith('1');
    expect(res.json).toHaveBeenCalledWith({ message: 'Siswa dihapus' });
  });

  test('siswa tidak ditemukan → 404', async () => {
    studentService.deleteStudent.mockRejectedValue(makeServiceError(404, 'Siswa tidak ditemukan'));

    const req = mockRequest({ params: { id: '999' } });
    const res = mockResponse();

    await studentController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('error unknown → 500', async () => {
    studentService.deleteStudent.mockRejectedValue(new Error('DB lock'));

    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();

    await studentController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus siswa' });
  });
});

// ── importExcel ───────────────────────────────────────────────────────────────
describe('studentController.importExcel', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tanpa file → 400', async () => {
    const req = mockRequest({ file: null });
    const res = mockResponse();

    await studentController.importExcel(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'File wajib diunggah' });
    expect(studentService.importStudents).not.toHaveBeenCalled();
  });

  test('dengan file → service dipanggil dan hasil dikembalikan', async () => {
    const result = { inserted: 5, skipped: 0, errors: [] };
    studentService.importStudents.mockResolvedValue(result);

    const buf = Buffer.from('data');
    const req = mockRequest({ file: { buffer: buf } });
    const res = mockResponse();

    await studentController.importExcel(req, res);

    expect(studentService.importStudents).toHaveBeenCalledWith(buf);
    expect(res.json).toHaveBeenCalledWith(result);
  });
});

// ── downloadTemplate ──────────────────────────────────────────────────────────
describe('studentController.downloadTemplate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('mengembalikan file xlsx dengan header yang tepat', async () => {
    const fakeBuffer = Buffer.from('template');
    studentService.getStudentTemplateBuffer.mockReturnValue(fakeBuffer);

    const req = mockRequest();
    const res = mockResponse();

    await studentController.downloadTemplate(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="template-siswa.xlsx"');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });
});
