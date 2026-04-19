/**
 * tests/unit_test/models/Student.test.js
 * Unit test untuk model Student.
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
  INTEGER:  'INTEGER',
  STRING:   (n) => `STRING(${n})`,
  ENUM:     (...vals) => `ENUM(${vals.join(',')})`,
  DATEONLY: 'DATEONLY',
};

const studentModelFactory = require('../../../models/Student');

describe('Model: Student', () => {
  let attrs;

  beforeAll(() => {
    studentModelFactory(mockSequelize, DataTypes);
    attrs = capturedDef.attributes;
  });

  test('define dipanggil dengan nama "Student"', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith('Student', expect.any(Object));
  });

  test('field id: INTEGER, autoIncrement, primaryKey', () => {
    expect(attrs.id.type).toBe('INTEGER');
    expect(attrs.id.autoIncrement).toBe(true);
    expect(attrs.id.primaryKey).toBe(true);
  });

  test('field nis: STRING(30), allowNull false, unique true', () => {
    expect(attrs.nis.type).toBe('STRING(30)');
    expect(attrs.nis.allowNull).toBe(false);
    expect(attrs.nis.unique).toBe(true);
  });

  test('field name: STRING(100), allowNull false', () => {
    expect(attrs.name.type).toBe('STRING(100)');
    expect(attrs.name.allowNull).toBe(false);
  });

  test('field gender: ENUM L/P, allowNull true', () => {
    expect(attrs.gender.type).toBe('ENUM(L,P)');
    expect(attrs.gender.allowNull).toBe(true);
  });

  test('field birthDate: DATEONLY, allowNull true', () => {
    expect(attrs.birthDate.type).toBe('DATEONLY');
    expect(attrs.birthDate.allowNull).toBe(true);
  });
});
