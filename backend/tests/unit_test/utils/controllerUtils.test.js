/**
 * tests/unit_test/utils/controllerUtils.test.js
 * Unit test untuk utils/controllerUtils.js
 */

'use strict';

const { handleControllerError, serializeValidationResult } = require('../../../utils/controllerUtils');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ── serializeValidationResult ─────────────────────────────────────────────────
describe('serializeValidationResult', () => {
  test('null → dikembalikan apa adanya', () => {
    expect(serializeValidationResult(null)).toBeNull();
  });

  test('string → dikembalikan apa adanya', () => {
    expect(serializeValidationResult('raw')).toBe('raw');
  });

  test('object dengan data → data dihapus, sisanya dikembalikan', () => {
    const result = serializeValidationResult({ valid: true, data: [1, 2], errors: [] });
    expect(result).toEqual({ valid: true, errors: [] });
    expect(result.data).toBeUndefined();
  });

  test('object tanpa data → dikembalikan utuh', () => {
    const result = serializeValidationResult({ valid: false, errors: ['x'] });
    expect(result).toEqual({ valid: false, errors: ['x'] });
  });
});

// ── handleControllerError ─────────────────────────────────────────────────────
describe('handleControllerError', () => {
  test('err.validation → 422 + serialized validation result', () => {
    const res = mockRes();
    const err = { status: 422, validation: { valid: false, data: [], errors: ['x'] } };

    handleControllerError(res, err, 'fallback');

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({ valid: false, errors: ['x'] });
  });

  test('err.validation tanpa err.status → status default 422', () => {
    const res = mockRes();
    const err = { validation: { valid: false } };

    handleControllerError(res, err, 'fallback');

    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('err.status + message → status(err.status).json({ message })', () => {
    const res = mockRes();
    const err = { status: 404, message: 'Tidak ada' };

    handleControllerError(res, err, 'fallback');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Tidak ada' });
  });

  test('err.status + code → payload menyertakan code', () => {
    const res = mockRes();
    const err = { status: 409, message: 'Konflik', code: 'DUP_KEY' };

    handleControllerError(res, err, 'fallback');

    expect(res.json).toHaveBeenCalledWith({ message: 'Konflik', code: 'DUP_KEY' });
  });

  test('err.status + details object → payload menyertakan details', () => {
    const res = mockRes();
    const err = { status: 400, message: 'Gagal', details: { field: 'name' } };

    handleControllerError(res, err, 'fallback');

    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal', details: { field: 'name' } });
  });

  test('err.status + details bukan object → details tidak disertakan', () => {
    const res = mockRes();
    const err = { status: 400, message: 'Gagal', details: 'bukan-object' };

    handleControllerError(res, err, 'fallback');

    const call = res.json.mock.calls[0][0];
    expect(call.details).toBeUndefined();
  });

  test('unknown error (tanpa status dan validation) → 500 + fallbackMessage', () => {
    const res = mockRes();
    const err = new Error('something unexpected');

    handleControllerError(res, err, 'Terjadi kesalahan server');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Terjadi kesalahan server' });
  });
});
