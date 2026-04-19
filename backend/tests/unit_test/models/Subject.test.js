/**
 * tests/unit_test/models/Subject.test.js
 * Unit test untuk model Subject (Mata Pelajaran).
 */

'use strict';

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
  INTEGER: 'INTEGER',
  STRING:  (n) => `STRING(${n})`,
  ENUM:    (...vals) => `ENUM(${vals.join(',')})`,
};

const subjectModelFactory = require('../../../models/Subject');

describe('Model: Subject', () => {
  let attrs;

  beforeAll(() => {
    subjectModelFactory(mockSequelize, DataTypes);
    attrs = capturedDef.attributes;
  });

  test('define dipanggil dengan nama "Subject"', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith('Subject', expect.any(Object));
  });

  test('field id: INTEGER, autoIncrement, primaryKey', () => {
    expect(attrs.id.type).toBe('INTEGER');
    expect(attrs.id.autoIncrement).toBe(true);
    expect(attrs.id.primaryKey).toBe(true);
  });

  test('field code: STRING(20), allowNull true (kode boleh kosong)', () => {
    expect(attrs.code.type).toBe('STRING(20)');
    expect(attrs.code.allowNull).toBe(true);
  });

  test('field name: STRING(100), allowNull false', () => {
    expect(attrs.name.type).toBe('STRING(100)');
    expect(attrs.name.allowNull).toBe(false);
  });

  test('field type: ENUM wajib/peminatan, allowNull false, default wajib', () => {
    expect(attrs.type.type).toBe('ENUM(wajib,peminatan)');
    expect(attrs.type.allowNull).toBe(false);
    expect(attrs.type.defaultValue).toBe('wajib');
  });

  test('field periodId: INTEGER, allowNull false', () => {
    expect(attrs.periodId.type).toBe('INTEGER');
    expect(attrs.periodId.allowNull).toBe(false);
  });
});
