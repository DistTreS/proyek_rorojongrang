/**
 * tests/unit_test/controllers/userController.test.js
 * Mock userAdminService
 */

'use strict';

jest.mock('../../../services/userAdminService');

const userAdminService = require('../../../services/userAdminService');
const userController   = require('../../../controllers/userController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };

const USER_FIXTURE   = { id: 1, username: 'admin', email: 'admin@s.id', isActive: true };
const LOGGED_IN_USER = { id: 1 };

// ── me ────────────────────────────────────────────────────────────────────────
describe('userController.me', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json profil', async () => {
    userAdminService.getMyProfile.mockResolvedValue(USER_FIXTURE);
    const req = mockRequest({ user: LOGGED_IN_USER });
    const res = mockResponse();
    await userController.me(req, res);
    expect(userAdminService.getMyProfile).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith(USER_FIXTURE);
  });

  test('error → 500', async () => {
    userAdminService.getMyProfile.mockRejectedValue(new Error('err'));
    const req = mockRequest({ user: LOGGED_IN_USER });
    const res = mockResponse();
    await userController.me(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat profil' });
  });

  test('known error → err.status', async () => {
    userAdminService.getMyProfile.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ user: LOGGED_IN_USER });
    const res = mockResponse();
    await userController.me(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── updateMe ──────────────────────────────────────────────────────────────────
describe('userController.updateMe', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil tanpa file → updateMyProfile dipanggil tanpa avatarUrl baru', async () => {
    userAdminService.updateMyProfile.mockResolvedValue(USER_FIXTURE);
    const req = mockRequest({ body: { name: 'Admin Baru' }, user: LOGGED_IN_USER, file: null });
    const res = mockResponse();
    await userController.updateMe(req, res);
    expect(userAdminService.updateMyProfile).toHaveBeenCalledWith(1, { name: 'Admin Baru' });
    expect(res.json).toHaveBeenCalledWith(USER_FIXTURE);
  });

  test('berhasil dengan file upload → avatarUrl diset dari filename', async () => {
    userAdminService.updateMyProfile.mockResolvedValue({ ...USER_FIXTURE, avatarUrl: '/uploads/avatars/a.jpg' });
    const req = mockRequest({ body: {}, user: LOGGED_IN_USER, file: { filename: 'a.jpg' } });
    const res = mockResponse();
    await userController.updateMe(req, res);
    expect(userAdminService.updateMyProfile).toHaveBeenCalledWith(1, { avatarUrl: '/uploads/avatars/a.jpg' });
  });

  test('error → 500', async () => {
    userAdminService.updateMyProfile.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {}, user: LOGGED_IN_USER, file: null });
    const res = mockResponse();
    await userController.updateMe(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui profil' });
  });

  test('known error → err.status', async () => {
    userAdminService.updateMyProfile.mockRejectedValue(makeError(400, 'Invalid'));
    const req = mockRequest({ body: {}, user: LOGGED_IN_USER, file: null });
    const res = mockResponse();
    await userController.updateMe(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── list ─────────────────────────────────────────────────────────────────────
describe('userController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    userAdminService.listAdminUsers.mockResolvedValue([USER_FIXTURE]);
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await userController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([USER_FIXTURE]);
  });
  test('error → 500', async () => {
    userAdminService.listAdminUsers.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await userController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat data user' });
  });
  test('known error → err.status', async () => {
    userAdminService.listAdminUsers.mockRejectedValue(makeError(403, 'Forbidden'));
    const req = mockRequest({ query: {} });
    const res = mockResponse();
    await userController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── detail ────────────────────────────────────────────────────────────────────
describe('userController.detail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    userAdminService.getAdminUserDetail.mockResolvedValue(USER_FIXTURE);
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await userController.detail(req, res);
    expect(res.json).toHaveBeenCalledWith(USER_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    userAdminService.getAdminUserDetail.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await userController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    userAdminService.getAdminUserDetail.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await userController.detail(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat detail user' });
  });
});

// ── create ────────────────────────────────────────────────────────────────────
describe('userController.create', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → 201', async () => {
    userAdminService.createAdminUser.mockResolvedValue(USER_FIXTURE);
    const req = mockRequest({ body: { username: 'admin2', password: 'pass' } });
    const res = mockResponse();
    await userController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(USER_FIXTURE);
  });
  test('duplikat username → 409', async () => {
    userAdminService.createAdminUser.mockRejectedValue(makeError(409, 'Username sudah dipakai'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await userController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('unknown error → 500', async () => {
    userAdminService.createAdminUser.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: {} });
    const res = mockResponse();
    await userController.create(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal membuat user' });
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('userController.update', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    userAdminService.updateAdminUser.mockResolvedValue(USER_FIXTURE);
    const req = mockRequest({ params: { id: '1' }, body: { isActive: false } });
    const res = mockResponse();
    await userController.update(req, res);
    expect(userAdminService.updateAdminUser).toHaveBeenCalledWith('1', { isActive: false });
    expect(res.json).toHaveBeenCalledWith(USER_FIXTURE);
  });
  test('tidak ditemukan → 404', async () => {
    userAdminService.updateAdminUser.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' }, body: {} });
    const res = mockResponse();
    await userController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    userAdminService.updateAdminUser.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await userController.update(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui user' });
  });
});

// ── remove ────────────────────────────────────────────────────────────────────
describe('userController.remove', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    userAdminService.deleteAdminUser.mockResolvedValue({ message: 'Dihapus' });
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await userController.remove(req, res);
    expect(res.json).toHaveBeenCalledWith({ message: 'Dihapus' });
  });
  test('tidak ditemukan → 404', async () => {
    userAdminService.deleteAdminUser.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { id: '99' } });
    const res = mockResponse();
    await userController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('unknown error → 500', async () => {
    userAdminService.deleteAdminUser.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' } });
    const res = mockResponse();
    await userController.remove(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menghapus user' });
  });
});
