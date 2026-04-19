/**
 * tests/unit_test/controllers/reportController.test.js
 * Mock reportService dan controllerUtils
 */

'use strict';

jest.mock('../../../services/reportService');
jest.mock('../../../utils/controllerUtils');

const reportService    = require('../../../services/reportService');
const controllerUtils  = require('../../../utils/controllerUtils');
const reportController = require('../../../controllers/reportController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

controllerUtils.handleControllerError.mockImplementation((res, err, fallback) => {
  if (err?.status) return res.status(err.status).json({ message: err.message });
  return res.status(500).json({ message: fallback });
});

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const USER = { id: 1, roles: ['kepala_sekolah'] };

// Helper untuk test sederhana berhasil + error
const testSimpleReport = (methodName, serviceName, fallbackMsg) => {
  describe(`reportController.${methodName}`, () => {
    beforeEach(() => jest.clearAllMocks());

    test('berhasil → res.json', async () => {
      reportService[serviceName].mockResolvedValue({ items: [] });
      const req = mockRequest({ query: {}, user: USER });
      const res = mockResponse();
      await reportController[methodName](req, res);
      expect(res.json).toHaveBeenCalledWith({ items: [] });
    });

    test('error → 500', async () => {
      reportService[serviceName].mockRejectedValue(new Error('err'));
      const req = mockRequest({ query: {}, user: USER });
      const res = mockResponse();
      await reportController[methodName](req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: fallbackMsg });
    });

    test('known error → err.status', async () => {
      reportService[serviceName].mockRejectedValue(makeError(403, 'Forbidden'));
      const req = mockRequest({ query: {}, user: USER });
      const res = mockResponse();
      await reportController[methodName](req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
};

testSimpleReport('globalReport',           'getGlobalReport',           'Gagal memuat laporan global');
testSimpleReport('reportByStudent',        'getReportByStudent',        'Gagal memuat laporan siswa');
testSimpleReport('reportByRombel',         'getReportByRombel',         'Gagal memuat laporan rombel');
testSimpleReport('reportByTimeSlot',       'getReportByTimeSlot',       'Gagal memuat laporan slot');
testSimpleReport('reportDaily',            'getDailyReport',            'Gagal memuat laporan harian');
testSimpleReport('reportMonthly',          'getMonthlyReport',          'Gagal memuat laporan bulanan');
testSimpleReport('reportSemester',         'getSemesterReport',         'Gagal memuat laporan semester');
testSimpleReport('reportByDateRange',      'getReportByDateRange',      'Gagal memuat laporan rentang tanggal');
testSimpleReport('reportByTeacherSubject', 'getReportByTeacherSubject', 'Gagal memuat laporan guru per mapel');

// ── exportReportFile (berbeda: mengirim buffer + set header) ────────────────
describe('reportController.exportReportFile', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → setHeader + res.send(buffer)', async () => {
    const fakeBuffer = Buffer.from('excel-data');
    reportService.exportReport.mockResolvedValue({
      buffer: fakeBuffer, mimeType: 'application/vnd.ms-excel', filename: 'laporan.xlsx'
    });

    const req = mockRequest({ query: { type: 'daily' }, user: USER });
    const res = mockResponse();

    await reportController.exportReportFile(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.ms-excel');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="laporan.xlsx"');
    expect(res.send).toHaveBeenCalledWith(fakeBuffer);
  });

  test('error → 500', async () => {
    reportService.exportReport.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await reportController.exportReportFile(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal mengekspor laporan' });
  });

  test('known error → err.status', async () => {
    reportService.exportReport.mockRejectedValue(makeError(400, 'Tipe tidak valid'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await reportController.exportReportFile(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
