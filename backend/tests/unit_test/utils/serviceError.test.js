/**
 * tests/unit_test/utils/serviceError.test.js
 * Unit test untuk utils/serviceError.js
 */

'use strict';

const { serviceError } = require('../../../utils/serviceError');

describe('serviceError', () => {
  test('membuat error dengan status dan message', () => {
    const err = serviceError(404, 'Tidak ditemukan');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Tidak ditemukan');
    expect(err.status).toBe(404);
  });

  test('tanpa details dan code → tidak ada property tersebut', () => {
    const err = serviceError(400, 'Buruk');
    expect(err.details).toBeUndefined();
    expect(err.code).toBeUndefined();
  });

  test('dengan details object → err.details diset', () => {
    const details = { field: 'name', reason: 'required' };
    const err = serviceError(422, 'Validation error', details);
    expect(err.details).toEqual(details);
  });

  test('details bukan object → details tidak diset', () => {
    const err = serviceError(400, 'Bad', 'bukan-object');
    expect(err.details).toBeUndefined();
  });

  test('dengan code → err.code diset sebagai string', () => {
    const err = serviceError(409, 'Conflict', null, 'DUPLICATE_KEY');
    expect(err.code).toBe('DUPLICATE_KEY');
  });

  test('code number → dikonversi ke string', () => {
    const err = serviceError(500, 'Error', null, 42);
    expect(err.code).toBe('42');
  });

  test('tanpa code (undefined) → code tidak diset', () => {
    const err = serviceError(400, 'Error');
    expect(err.code).toBeUndefined();
  });
});
