/**
 * tests/unit_test/controllers/studentNoteController.test.js
 * Mock controllerUtils karena controller ini pakai handleControllerError
 */

'use strict';

jest.mock('../../../services/studentNoteService');
jest.mock('../../../utils/controllerUtils');

const studentNoteService    = require('../../../services/studentNoteService');
const controllerUtils       = require('../../../utils/controllerUtils');
const studentNoteController = require('../../../controllers/studentNoteController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

controllerUtils.handleControllerError.mockImplementation((res, err, fallback) => {
  if (err?.status) return res.status(err.status).json({ message: err.message });
  return res.status(500).json({ message: fallback });
});

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const NOTE_FIXTURE = { id: 1, studentId: 5, content: 'Catatan', authorId: 2 };
const USER = { id: 2, roles: ['guru'] };

describe('studentNoteController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    studentNoteService.listStudentNotes.mockResolvedValue([NOTE_FIXTURE]);
    const req = mockRequest({ query: { studentId: '5' }, user: USER });
    const res = mockResponse();
    await studentNoteController.list(req, res);
    expect(studentNoteService.listStudentNotes).toHaveBeenCalledWith({ studentId: '5', user: USER });
    expect(res.json).toHaveBeenCalledWith([NOTE_FIXTURE]);
  });
  test('error → 500', async () => {
    studentNoteService.listStudentNotes.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat catatan' });
  });
  test('known error → err.status', async () => {
    studentNoteService.listStudentNotes.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('studentNoteController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    studentNoteService.createStudentNote.mockResolvedValue(NOTE_FIXTURE);
    const req = mockRequest({ body: { studentId: 5, content: 'Catatan' }, user: USER });
    const res = mockResponse();
    await studentNoteController.create(req, res);
    expect(studentNoteService.createStudentNote).toHaveBeenCalledWith({
      user: USER, payload: { studentId: 5, content: 'Catatan' }
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(NOTE_FIXTURE);
  });
  test('validasi gagal → 400', async () => {
    studentNoteService.createStudentNote.mockRejectedValue(makeError(400, 'Content wajib'));
    const req = mockRequest({ body: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('unknown error → 500', async () => {
    studentNoteService.createStudentNote.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menyimpan catatan' });
  });
});

describe('studentNoteController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    studentNoteService.updateStudentNote.mockResolvedValue(NOTE_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: { content: 'Updated' }, user: USER });
    const res = mockResponse();
    await studentNoteController.update(req, res);
    expect(studentNoteService.updateStudentNote).toHaveBeenCalledWith({
      user: USER, id: '1', payload: { content: 'Updated' }
    });
    expect(res.json).toHaveBeenCalledWith(NOTE_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    studentNoteService.updateStudentNote.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    studentNoteService.updateStudentNote.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {}, user: USER });
    const res = mockResponse();
    await studentNoteController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui catatan' });
  });
});

describe('studentNoteController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    studentNoteService.deleteStudentNote.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' }, user: USER });
    const res = mockResponse();
    await studentNoteController.remove(req, res);
    expect(studentNoteService.deleteStudentNote).toHaveBeenCalledWith({ user: USER, id: '1' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('tidak ditemukan → 404', async () => {
    studentNoteService.deleteStudentNote.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, user: USER });
    const res = mockResponse();
    await studentNoteController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    studentNoteService.deleteStudentNote.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, user: USER });
    const res = mockResponse();
    await studentNoteController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus catatan' });
  });
});
