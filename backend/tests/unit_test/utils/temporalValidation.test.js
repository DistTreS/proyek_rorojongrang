/**
 * tests/unit_test/utils/temporalValidation.test.js
 * Unit test untuk utils/temporalValidation.js — cover 100% branch
 */

'use strict';

const {
  ensureDateOrder,
  normalizeDateOnly,
  normalizeOptionalDateOnly
} = require('../../../utils/temporalValidation');

// ── normalizeDateOnly ─────────────────────────────────────────────────────────
describe('normalizeDateOnly', () => {
  test('tanggal valid → dikembalikan as-is', () => {
    expect(normalizeDateOnly('2024-08-17')).toBe('2024-08-17');
  });

  test('format bukan YYYY-MM-DD → throw 400', () => {
    expect(() => normalizeDateOnly('17-08-2024')).toThrow();
    try { normalizeDateOnly('17-08-2024'); } catch (err) { expect(err.status).toBe(400); }
  });

  test('format benar tapi tanggal tidak valid (Feb 30) → throw 400', () => {
    expect(() => normalizeDateOnly('2024-02-30')).toThrow();
  });

  test('format benar tapi bulan tidak valid (month=13) → throw 400', () => {
    expect(() => normalizeDateOnly('2024-13-01')).toThrow();
  });

  test('string kosong → throw 400', () => {
    expect(() => normalizeDateOnly('')).toThrow();
  });

  test('null → throw 400', () => {
    expect(() => normalizeDateOnly(null)).toThrow();
  });

  test('fieldLabel kustom digunakan dalam pesan error', () => {
    try {
      normalizeDateOnly('bad-date', 'Tanggal Mulai');
    } catch (err) {
      expect(err.message).toContain('Tanggal Mulai');
    }
  });

  test('tanggal valid dengan fieldLabel default', () => {
    expect(normalizeDateOnly('2025-12-31', 'Tanggal')).toBe('2025-12-31');
  });
});

// ── normalizeOptionalDateOnly ─────────────────────────────────────────────────
describe('normalizeOptionalDateOnly', () => {
  test('undefined → null', () => {
    expect(normalizeOptionalDateOnly(undefined)).toBeNull();
  });

  test('null → null', () => {
    expect(normalizeOptionalDateOnly(null)).toBeNull();
  });

  test('string kosong → null', () => {
    expect(normalizeOptionalDateOnly('')).toBeNull();
  });

  test('tanggal valid → dikembalikan as-is', () => {
    expect(normalizeOptionalDateOnly('2024-08-17')).toBe('2024-08-17');
  });

  test('format tidak valid → throw 400', () => {
    expect(() => normalizeOptionalDateOnly('bad')).toThrow();
  });
});

// ── ensureDateOrder ───────────────────────────────────────────────────────────
describe('ensureDateOrder', () => {
  test('startDate < endDate → dikembalikan normalized', () => {
    const result = ensureDateOrder('2024-01-01', '2024-12-31');
    expect(result).toEqual({ startDate: '2024-01-01', endDate: '2024-12-31' });
  });

  test('startDate === endDate dan allowEqual=true (default) → valid', () => {
    const result = ensureDateOrder('2024-06-01', '2024-06-01');
    expect(result.startDate).toBe('2024-06-01');
    expect(result.endDate).toBe('2024-06-01');
  });

  test('startDate > endDate → throw 400', () => {
    expect(() => ensureDateOrder('2024-12-31', '2024-01-01')).toThrow();
    try { ensureDateOrder('2024-12-31', '2024-01-01'); } catch (err) { expect(err.status).toBe(400); }
  });

  test('startDate === endDate dan allowEqual=false → throw 400', () => {
    expect(() =>
      ensureDateOrder('2024-06-01', '2024-06-01', { allowEqual: false })
    ).toThrow();
  });

  test('startDate invalid format → throw 400', () => {
    expect(() => ensureDateOrder('bad', '2024-12-31')).toThrow();
  });

  test('endDate invalid format → throw 400', () => {
    expect(() => ensureDateOrder('2024-01-01', 'bad')).toThrow();
  });

  test('errorMessage kustom digunakan saat invalid', () => {
    try {
      ensureDateOrder('2024-12-31', '2024-01-01', { errorMessage: 'Tanggal salah urutan' });
    } catch (err) {
      expect(err.message).toBe('Tanggal salah urutan');
    }
  });

  test('startLabel dan endLabel kustom', () => {
    const result = ensureDateOrder('2024-01-01', '2024-06-30', {
      startLabel: 'Awal Semester',
      endLabel: 'Akhir Semester'
    });
    expect(result.startDate).toBe('2024-01-01');
  });
});
