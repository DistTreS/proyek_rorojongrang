/**
 * tests/unit_test/models/Rombel.test.js
 *
 * Unit test untuk model Rombel.
 * Strategi: mock sequelize.define sehingga tidak butuh koneksi DB nyata.
 * Verifikasi bahwa field-field & opsinya sudah benar.
 */

'use strict';

// ── mock sequelize.define ───────────────────────────────────────────────────
const capturedDef = {};

const mockSequelize = {
  define: jest.fn((modelName, attributes, options) => {
    capturedDef.modelName  = modelName;
    capturedDef.attributes = attributes;
    capturedDef.options    = options;
    return { modelName, rawAttributes: attributes };
  })
};

const DataTypes = {
  INTEGER:     'INTEGER',
  STRING:      (n) => `STRING(${n})`,
  ENUM:        (...vals) => `ENUM(${vals.join(',')})`,
  BOOLEAN:     'BOOLEAN',
  DATEONLY:    'DATEONLY',
  DATE:        'DATE',
  TEXT:        'TEXT',
  TIME:        'TIME',
};

// ── load model ──────────────────────────────────────────────────────────────
const rombelModelFactory = require('../../../models/Rombel');

describe('Model: Rombel', () => {
  let attrs;

  beforeAll(() => {
    rombelModelFactory(mockSequelize, DataTypes);
    attrs = capturedDef.attributes;
  });

  test('sequelize.define dipanggil dengan nama "Rombel"', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith('Rombel', expect.any(Object));
  });

  test('field id: INTEGER, autoIncrement, primaryKey', () => {
    expect(attrs.id.type).toBe('INTEGER');
    expect(attrs.id.autoIncrement).toBe(true);
    expect(attrs.id.primaryKey).toBe(true);
  });

  test('field name: STRING(50), allowNull false', () => {
    expect(attrs.name.type).toBe('STRING(50)');
    expect(attrs.name.allowNull).toBe(false);
  });

  test('field gradeLevel: INTEGER, allowNull true', () => {
    expect(attrs.gradeLevel.type).toBe('INTEGER');
    expect(attrs.gradeLevel.allowNull).toBe(true);
  });

  test('field type: ENUM utama/peminatan, allowNull false, default utama', () => {
    expect(attrs.type.type).toBe('ENUM(utama,peminatan)');
    expect(attrs.type.allowNull).toBe(false);
    expect(attrs.type.defaultValue).toBe('utama');
  });

  test('field periodId: INTEGER, allowNull false', () => {
    expect(attrs.periodId.type).toBe('INTEGER');
    expect(attrs.periodId.allowNull).toBe(false);
  });

  test('tidak ada field yang tidak dikenal', () => {
    const knownFields = ['id', 'name', 'gradeLevel', 'type', 'periodId'];
    const actualFields = Object.keys(attrs);
    expect(actualFields).toEqual(expect.arrayContaining(knownFields));
    expect(actualFields.length).toBe(knownFields.length);
  });
});
