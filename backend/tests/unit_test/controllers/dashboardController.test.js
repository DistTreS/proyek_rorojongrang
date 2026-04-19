/**
 * tests/unit_test/controllers/dashboardController.test.js
 *
 * Dashboard controller query langsung ke models. 
 * Dibuat manual mock dengan jest.mock factory untuk memastikan mock diterapkan 
 * sebelum require controller.
 */

'use strict';

// ── Setup semua mock SEBELUM require controller ───────────────────────────────

const mockAcademicPeriod = {
  findByPk: jest.fn(),
  findOne:  jest.fn()
};
const mockStudent            = { count: jest.fn(), findAll: jest.fn() };
const mockRombel             = { count: jest.fn() };
const mockTeachingAssignment = { count: jest.fn(), findAll: jest.fn() };
const fnMock                 = jest.fn();
const colMock                = jest.fn();
const mockAttendance         = {
  findAll:   jest.fn(),
  sequelize: { fn: fnMock, col: colMock }
};

jest.mock('../../../models', () => ({
  AcademicPeriod:      mockAcademicPeriod,
  Student:             mockStudent,
  Rombel:              mockRombel,
  TeachingAssignment:  mockTeachingAssignment,
  Attendance:          mockAttendance
}));

const mockIsGuru           = jest.fn();
const mockGetTeacherContext = jest.fn();
jest.mock('../../../services/teacherOperationalService', () => ({
  isGuruScopedUser:  (...args) => mockIsGuru(...args),
  getTeacherContext: (...args) => mockGetTeacherContext(...args)
}));

const mockNormalizeOpt  = jest.fn();
const mockEnsureOrder   = jest.fn();
jest.mock('../../../utils/temporalValidation', () => ({
  normalizeOptionalDateOnly: (...args) => mockNormalizeOpt(...args),
  ensureDateOrder:           (...args) => mockEnsureOrder(...args)
}));

// Baru require controller setelah semua mock terdaftar
const dashboardController        = require('../../../controllers/dashboardController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

// ── Default setup per test ────────────────────────────────────────────────────
const setupDefaults = () => {
  mockAcademicPeriod.findByPk.mockResolvedValue(null);
  mockAcademicPeriod.findOne.mockResolvedValue({ id: 1, name: '2024/2025 Ganjil' });
  mockStudent.count.mockResolvedValue(100);
  mockStudent.findAll.mockResolvedValue([]);
  mockRombel.count.mockResolvedValue(10);
  mockTeachingAssignment.count.mockResolvedValue(20);
  mockTeachingAssignment.findAll.mockResolvedValue([]);
  mockAttendance.findAll.mockResolvedValue([
    { status: 'hadir', get: jest.fn(() => 80) },
    { status: 'alpa',  get: jest.fn(() => 5)  }
  ]);
  mockIsGuru.mockReturnValue(false);
  mockGetTeacherContext.mockResolvedValue(null);
  mockNormalizeOpt.mockReturnValue(null);
  mockEnsureOrder.mockReturnValue({ startDate: '2024-08-01', endDate: '2024-08-31' });
};

// ── non-guru ──────────────────────────────────────────────────────────────────
describe('dashboardController.overview — non-guru', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
  });

  test('berhasil → res.json dengan semua field', async () => {
    const req = mockRequest({ query: {}, user: { id: 1, roles: ['kepala_sekolah'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.period).toEqual({ id: 1, name: '2024/2025 Ganjil' });
    expect(result.students).toBe(100);
    expect(result.rombels).toBe(10);
    expect(result.teachingAssignments).toBe(20);
    expect(result.attendanceSummary.hadir).toBe(80);
    expect(result.attendanceSummary.alpa).toBe(5);
    expect(result.dateRange).toEqual({ from: '2024-08-01', to: '2024-08-31' });
  });

  test('dengan periodId di query → findByPk dipanggil', async () => {
    mockAcademicPeriod.findByPk.mockResolvedValue({ id: 2, name: 'Periode 2' });

    const req = mockRequest({ query: { periodId: '2' }, user: { id: 1, roles: ['wakasek'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    expect(mockAcademicPeriod.findByPk).toHaveBeenCalledWith('2');
    const result = res.json.mock.calls[0][0];
    expect(result.period).toEqual({ id: 2, name: 'Periode 2' });
  });

  test('periode tidak ditemukan (null) → period: null di response', async () => {
    mockAcademicPeriod.findOne.mockResolvedValue(null);

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['wakasek'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.period).toBeNull();
  });
});

// ── guru scoped ───────────────────────────────────────────────────────────────
describe('dashboardController.overview — guru scoped', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
    mockIsGuru.mockReturnValue(true);
  });

  test('guru dengan teacher → studentCount dari rombel assignments', async () => {
    mockGetTeacherContext.mockResolvedValue({ id: 5 });
    mockTeachingAssignment.findAll.mockResolvedValue([
      { rombelId: 1 }, { rombelId: 2 }, { rombelId: 1 }
    ]);
    mockTeachingAssignment.count.mockResolvedValue(3);
    mockStudent.findAll.mockResolvedValue([{ id: 10 }, { id: 11 }]);

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['guru'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.rombels).toBe(2);
    expect(result.students).toBe(2);
    expect(result.teachingAssignments).toBe(3);
  });

  test('guru tanpa teacher context → counts semua 0', async () => {
    mockGetTeacherContext.mockResolvedValue(null);

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['guru'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.students).toBe(0);
    expect(result.rombels).toBe(0);
    expect(result.teachingAssignments).toBe(0);
  });

  test('guru: attendance where pakai teacherId dari context', async () => {
    // panggilan 1 (counts) dan 2 (attendance) masing-masing return teacher
    mockGetTeacherContext
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({ id: 5 });
    mockTeachingAssignment.findAll.mockResolvedValue([]);
    mockTeachingAssignment.count.mockResolvedValue(0);

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['guru'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    expect(res.json).toHaveBeenCalled();
  });

  test('guru: teacher null di attendance → guard -1', async () => {
    mockGetTeacherContext
      .mockResolvedValueOnce(null)  // untuk counts
      .mockResolvedValueOnce(null); // untuk attendance

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['guru'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    expect(res.json).toHaveBeenCalled();
  });

  test('guru dengan teacher context dan period → assignmentWhere include periodId', async () => {
    mockGetTeacherContext.mockResolvedValue({ id: 5 });
    mockTeachingAssignment.findAll.mockResolvedValue([]);
    mockTeachingAssignment.count.mockResolvedValue(0);

    const req = mockRequest({ query: { periodId: '1' }, user: { id: 1, roles: ['guru'] } });
    const res = mockResponse();

    // findByPk dengan periodId dikembalikan — maka teacher ops + period assignment filter
    mockAcademicPeriod.findByPk.mockResolvedValue({ id: 1, name: 'Periode 1' });

    await dashboardController.overview(req, res);

    expect(res.json).toHaveBeenCalled();
  });
});

// ── error handling ────────────────────────────────────────────────────────────
describe('dashboardController.overview — error handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaults();
  });

  test('known serviceError (err.status) → res.status(err.status)', async () => {
    const err = new Error('Periode tidak valid');
    err.status = 400;
    mockEnsureOrder.mockImplementation(() => { throw err; });

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['wakasek'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Periode tidak valid' });
  });

  test('unknown error → 500 fallback', async () => {
    mockAcademicPeriod.findOne.mockRejectedValue(new Error('DB down'));

    const req = mockRequest({ query: {}, user: { id: 1, roles: ['wakasek'] } });
    const res = mockResponse();

    await dashboardController.overview(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat data dashboard' });
  });
});
