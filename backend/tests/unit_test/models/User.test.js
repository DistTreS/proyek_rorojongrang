/**
 * tests/unit_test/models/User.test.js
 * Unit test untuk model User.
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
  BOOLEAN:  'BOOLEAN',
  DATEONLY: 'DATEONLY',
  DATE:     'DATE',
};

const userModelFactory = require('../../../models/User');

describe('Model: User', () => {
  let attrs;

  beforeAll(() => {
    userModelFactory(mockSequelize, DataTypes);
    attrs = capturedDef.attributes;
  });

  test('define dipanggil dengan nama "User"', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith('User', expect.any(Object));
  });

  test('field id: INTEGER, autoIncrement, primaryKey', () => {
    expect(attrs.id.type).toBe('INTEGER');
    expect(attrs.id.autoIncrement).toBe(true);
    expect(attrs.id.primaryKey).toBe(true);
  });

  test('field username: STRING(50), allowNull false, unique true', () => {
    expect(attrs.username.type).toBe('STRING(50)');
    expect(attrs.username.allowNull).toBe(false);
    expect(attrs.username.unique).toBe(true);
  });

  test('field email: STRING(100), allowNull false, unique true', () => {
    expect(attrs.email.type).toBe('STRING(100)');
    expect(attrs.email.allowNull).toBe(false);
    expect(attrs.email.unique).toBe(true);
  });

  test('field passwordHash: STRING(255), allowNull false', () => {
    expect(attrs.passwordHash.type).toBe('STRING(255)');
    expect(attrs.passwordHash.allowNull).toBe(false);
  });

  test('field avatarUrl: STRING(255), allowNull true', () => {
    expect(attrs.avatarUrl.type).toBe('STRING(255)');
    expect(attrs.avatarUrl.allowNull).toBe(true);
  });

  test('field isActive: BOOLEAN, allowNull false, default true', () => {
    expect(attrs.isActive.type).toBe('BOOLEAN');
    expect(attrs.isActive.allowNull).toBe(false);
    expect(attrs.isActive.defaultValue).toBe(true);
  });
});
