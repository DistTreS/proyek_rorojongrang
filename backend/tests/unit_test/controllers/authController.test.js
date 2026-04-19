/**
 * tests/unit_test/controllers/authController.test.js
 * Unit test untuk authController — menggunakan handleControllerError dari controllerUtils
 */

'use strict';

jest.mock('../../../services/authService');
jest.mock('../../../utils/controllerUtils');

const authService      = require('../../../services/authService');
const controllerUtils  = require('../../../utils/controllerUtils');
const authController   = require('../../../controllers/authController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

// Buat handleControllerError sebagai mock yang benar secara fungsional
controllerUtils.handleControllerError.mockImplementation((res, err, fallback) => {
  if (err?.status) return res.status(err.status).json({ message: err.message });
  return res.status(500).json({ message: fallback });
});

const makeError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── login ─────────────────────────────────────────────────────────────────────
describe('authController.login', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan token data', async () => {
    const payload = { accessToken: 'abc', refreshToken: 'xyz' };
    authService.loginUser.mockResolvedValue(payload);

    const req = mockRequest({ body: { username: 'budi', password: 'pass' } });
    const res = mockResponse();

    await authController.login(req, res);

    expect(authService.loginUser).toHaveBeenCalledWith({ username: 'budi', password: 'pass' });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('credentials salah → 401', async () => {
    authService.loginUser.mockRejectedValue(makeError(401, 'Login failed'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('unknown error → 500 + fallback', async () => {
    authService.loginUser.mockRejectedValue(new Error('DB error'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Login failed' });
  });
});

// ── refresh ─────────────────────────────────────────────────────────────────────
describe('authController.refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan token baru', async () => {
    const payload = { accessToken: 'new-access' };
    authService.refreshUserSession.mockResolvedValue(payload);

    const req = mockRequest({ body: { refreshToken: 'rt' } });
    const res = mockResponse();

    await authController.refresh(req, res);

    expect(authService.refreshUserSession).toHaveBeenCalledWith({ refreshToken: 'rt' });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('refresh token tidak valid → 401', async () => {
    authService.refreshUserSession.mockRejectedValue(makeError(401, 'Refresh failed'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ── logout ─────────────────────────────────────────────────────────────────────
describe('authController.logout', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json dengan pesan sukses', async () => {
    authService.logoutUserSession.mockResolvedValue({ message: 'Logged out' });

    const req = mockRequest({ body: { refreshToken: 'rt' } });
    const res = mockResponse();

    await authController.logout(req, res);

    expect(authService.logoutUserSession).toHaveBeenCalledWith({ refreshToken: 'rt' });
    expect(res.json).toHaveBeenCalledWith({ message: 'Logged out' });
  });

  test('unknown error → 500', async () => {
    authService.logoutUserSession.mockRejectedValue(new Error('unexpected'));

    const req = mockRequest({ body: {} });
    const res = mockResponse();

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
