/**
 * tests/unit_test/utils/token.test.js
 * Unit test untuk utils/token.js — mock jwt dan uuid
 */

'use strict';

jest.mock('jsonwebtoken');
jest.mock('../../../config/rbac');

const jwt   = require('jsonwebtoken');
const rbac  = require('../../../config/rbac');

// normalizeRoles harus dikembalikan sebagai mock
rbac.normalizeRoles = jest.fn((roles) => roles || []);

const { buildAccessToken, buildRefreshToken } = require('../../../utils/token');

describe('buildAccessToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET     = 'test-access-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '30m';
  });

  test('memanggil jwt.sign dengan payload yang benar', () => {
    jwt.sign.mockReturnValue('fake-access-token');
    rbac.normalizeRoles.mockReturnValue(['guru']);

    const user = { id: 5, username: 'budi', roles: ['guru'] };
    const token = buildAccessToken(user);

    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 5, username: 'budi', roles: ['guru'] },
      'test-access-secret',
      { expiresIn: '30m' }
    );
    expect(token).toBe('fake-access-token');
  });

  test('menggunakan default expiresIn "15m" jika env tidak diset', () => {
    delete process.env.JWT_ACCESS_EXPIRES_IN;
    jwt.sign.mockReturnValue('tok');
    rbac.normalizeRoles.mockReturnValue([]);

    buildAccessToken({ id: 1, username: 'x', roles: [] });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      { expiresIn: '15m' }
    );
  });
});

describe('buildRefreshToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_SECRET     = 'test-refresh-secret';
    process.env.JWT_REFRESH_EXPIRES_IN = '14d';
  });

  test('memanggil jwt.sign dengan payload refresh yang benar', () => {
    jwt.sign.mockReturnValue('fake-refresh-token');

    const user  = { id: 5 };
    const token = buildRefreshToken(user);

    const callArgs = jwt.sign.mock.calls[0];
    expect(callArgs[0].sub).toBe(5);
    expect(callArgs[0].tokenType).toBe('refresh');
    expect(typeof callArgs[0].jti).toBe('string');
    expect(callArgs[0].jti.length).toBeGreaterThan(0);
    expect(callArgs[1]).toBe('test-refresh-secret');
    expect(callArgs[2]).toEqual({ expiresIn: '14d' });
    expect(token).toBe('fake-refresh-token');
  });

  test('menggunakan default expiresIn "7d" jika env tidak diset', () => {
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    jwt.sign.mockReturnValue('tok');

    buildRefreshToken({ id: 1 });

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(String),
      { expiresIn: '7d' }
    );
  });
});
