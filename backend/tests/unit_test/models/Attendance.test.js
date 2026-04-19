/**
 * tests/unit_test/models/Attendance.test.js
 * Unit test untuk model Attendance.
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

const attendanceModelFactory = require('../../../models/Attendance');

describe('Model: Attendance', () => {
  let attrs;

  beforeAll(() => {
    attendanceModelFactory(mockSequelize, DataTypes);
    attrs = capturedDef.attributes;
  });

  test('define dipanggil dengan nama "Attendance"', () => {
    expect(mockSequelize.define).toHaveBeenCalledWith('Attendance', expect.any(Object));
  });

  test('field id: INTEGER, autoIncrement, primaryKey', () => {
    expect(attrs.id.autoIncrement).toBe(true);
    expect(attrs.id.primaryKey).toBe(true);
  });

  test('field meetingId: STRING(36), allowNull true (UUID pertemuan)', () => {
    expect(attrs.meetingId.type).toBe('STRING(36)');
    expect(attrs.meetingId.allowNull).toBe(true);
  });

  test('field studentId: INTEGER, allowNull false', () => {
    expect(attrs.studentId.type).toBe('INTEGER');
    expect(attrs.studentId.allowNull).toBe(false);
  });

  test('field rombelId: INTEGER, allowNull false', () => {
    expect(attrs.rombelId.type).toBe('INTEGER');
    expect(attrs.rombelId.allowNull).toBe(false);
  });

  test('field timeSlotId: INTEGER, allowNull false', () => {
    expect(attrs.timeSlotId.type).toBe('INTEGER');
    expect(attrs.timeSlotId.allowNull).toBe(false);
  });

  test('field date: DATEONLY, allowNull false', () => {
    expect(attrs.date.type).toBe('DATEONLY');
    expect(attrs.date.allowNull).toBe(false);
  });

  test('field status: ENUM hadir/izin/sakit/alpa, allowNull false', () => {
    expect(attrs.status.type).toBe('ENUM(hadir,izin,sakit,alpa)');
    expect(attrs.status.allowNull).toBe(false);
  });

  test('field note: STRING(255), allowNull true', () => {
    expect(attrs.note.type).toBe('STRING(255)');
    expect(attrs.note.allowNull).toBe(true);
  });

  test('field subjectId, teacherId: nullable FK', () => {
    expect(attrs.subjectId.allowNull).toBe(true);
    expect(attrs.teacherId.allowNull).toBe(true);
  });

  test('field substituteTeacherId: allowNull true (guru pengganti)', () => {
    expect(attrs.substituteTeacherId.allowNull).toBe(true);
  });
});
