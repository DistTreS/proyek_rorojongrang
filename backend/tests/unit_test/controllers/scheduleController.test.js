/**
 * tests/unit_test/controllers/scheduleController.test.js
 * Mock scheduleBatchService, scheduleValidationService, controllerUtils
 */

'use strict';

jest.mock('../../../services/scheduleBatchService');
jest.mock('../../../services/scheduleValidationService');
jest.mock('../../../utils/controllerUtils');

const scheduleBatchService      = require('../../../services/scheduleBatchService');
const scheduleValidationService = require('../../../services/scheduleValidationService');
const controllerUtils           = require('../../../utils/controllerUtils');
const scheduleController        = require('../../../controllers/scheduleController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

// Stub handleControllerError dan serializeValidationResult
controllerUtils.handleControllerError.mockImplementation((res, err, fallback) => {
  if (err?.status) return res.status(err.status).json({ message: err.message });
  return res.status(500).json({ message: fallback });
});
controllerUtils.serializeValidationResult.mockImplementation((r) => {
  if (!r || typeof r !== 'object') return r;
  const { data, ...rest } = r;
  return rest;
});

const makeError = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const USER = { id: 1, roles: ['wakasek'] };

// ── list ─────────────────────────────────────────────────────────────────────
describe('scheduleController.list', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.listScheduleItems.mockResolvedValue([]);
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.list(req, res);
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    scheduleBatchService.listScheduleItems.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.list(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat jadwal' });
  });
});

// ── listBatches ───────────────────────────────────────────────────────────────
describe('scheduleController.listBatches', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.listScheduleBatches.mockResolvedValue([]);
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.listBatches(req, res);
    expect(res.json).toHaveBeenCalledWith([]);
  });
  test('error → 500', async () => {
    scheduleBatchService.listScheduleBatches.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.listBatches(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memuat batch jadwal' });
  });
});

// ── batchDetail ───────────────────────────────────────────────────────────────
describe('scheduleController.batchDetail', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.getScheduleBatchDetail.mockResolvedValue({ id: 'b1' });
    const req = mockRequest({ params: { batchId: 'b1' }, user: USER });
    const res = mockResponse();
    await scheduleController.batchDetail(req, res);
    expect(scheduleBatchService.getScheduleBatchDetail).toHaveBeenCalledWith('b1', { user: USER });
    expect(res.json).toHaveBeenCalledWith({ id: 'b1' });
  });
  test('tidak ditemukan → 404', async () => {
    scheduleBatchService.getScheduleBatchDetail.mockRejectedValue(makeError(404, 'Not found'));
    const req = mockRequest({ params: { batchId: 'x' }, user: USER });
    const res = mockResponse();
    await scheduleController.batchDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── validate ──────────────────────────────────────────────────────────────────
describe('scheduleController.validate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('berhasil → res.json serialized result', async () => {
    const validResult = { valid: true, data: [1, 2], warnings: [] };
    scheduleValidationService.validateScheduleGenerationData.mockResolvedValue(validResult);

    const req = mockRequest({ query: { periodId: '1' }, body: { constraints: {} } });
    const res = mockResponse();

    await scheduleController.validate(req, res);

    expect(res.json).toHaveBeenCalledWith({ valid: true, warnings: [] }); // data dihapus oleh serialize
  });

  test('constraints JSON string valid → di-parse dan diteruskan', async () => {
    scheduleValidationService.validateScheduleGenerationData.mockResolvedValue({ valid: true });
    const req = mockRequest({ query: { periodId: '1' }, body: { constraints: '{"maxHours":6}' } });
    const res = mockResponse();
    await scheduleController.validate(req, res);
    expect(scheduleValidationService.validateScheduleGenerationData).toHaveBeenCalledWith('1', { maxHours: 6 });
  });

  test('constraints JSON string tidak valid → 400 CONSTRAINTS_INVALID_JSON', async () => {
    const req = mockRequest({ query: { periodId: '1' }, body: { constraints: 'BUKAN JSON' } });
    const res = mockResponse();
    await scheduleController.validate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Format constraints harus JSON object yang valid' });
  });

  test('constraints berupa array (bukan object) → 400 CONSTRAINTS_INVALID_TYPE', async () => {
    const req = mockRequest({ query: {}, body: { constraints: '[1,2,3]' } });
    const res = mockResponse();
    await scheduleController.validate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Field constraints harus berupa object JSON' });
  });

  test('constraints tipe selain string/object → CONSTRAINTS_INVALID_TYPE untuk number', async () => {
    // Kirim constraints sebagai number (bukan string, bukan object, bukan null)
    const req = mockRequest({ query: {}, body: { constraints: 123 } });
    const res = mockResponse();
    await scheduleController.validate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Field constraints harus berupa object JSON' });
  });

  test('service error → 500', async () => {
    scheduleValidationService.validateScheduleGenerationData.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, body: {} });
    const res = mockResponse();
    await scheduleController.validate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memvalidasi data penjadwalan' });
  });
});

// ── generate ──────────────────────────────────────────────────────────────────
describe('scheduleController.generate', () => {
  beforeEach(() => jest.clearAllMocks());

  test('tanpa periodId → 400', async () => {
    const req = mockRequest({ body: {}, user: USER });
    const res = mockResponse();
    await scheduleController.generate(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Periode wajib diisi' });
    expect(scheduleBatchService.generateDraftScheduleBatch).not.toHaveBeenCalled();
  });

  test('berhasil → res.json', async () => {
    scheduleBatchService.generateDraftScheduleBatch.mockResolvedValue({ batchId: 'b1' });
    const req = mockRequest({ body: { periodId: 1 }, user: USER });
    const res = mockResponse();
    await scheduleController.generate(req, res);
    expect(scheduleBatchService.generateDraftScheduleBatch).toHaveBeenCalledWith({
      periodId: 1, constraints: undefined, userId: 1
    });
    expect(res.json).toHaveBeenCalledWith({ batchId: 'b1' });
  });

  test('error → 500', async () => {
    scheduleBatchService.generateDraftScheduleBatch.mockRejectedValue(new Error('err'));
    const req = mockRequest({ body: { periodId: 1 }, user: USER });
    const res = mockResponse();
    await scheduleController.generate(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menyimpan draft jadwal' });
  });
});

// ── updateItem ────────────────────────────────────────────────────────────────
describe('scheduleController.updateItem', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.updateDraftScheduleItem.mockResolvedValue({ id: '1' });
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await scheduleController.updateItem(req, res);
    expect(res.json).toHaveBeenCalledWith({ id: '1' });
  });
  test('error → 500', async () => {
    scheduleBatchService.updateDraftScheduleItem.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await scheduleController.updateItem(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memperbarui item draft jadwal' });
  });
});

// ── moveItemSlot ──────────────────────────────────────────────────────────────
describe('scheduleController.moveItemSlot', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.moveDraftScheduleItem.mockResolvedValue({ moved: true });
    const req = mockRequest({ params: { id: '1' }, body: { timeSlotId: 2 } });
    const res = mockResponse();
    await scheduleController.moveItemSlot(req, res);
    expect(res.json).toHaveBeenCalledWith({ moved: true });
  });
  test('error → 500', async () => {
    scheduleBatchService.moveDraftScheduleItem.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await scheduleController.moveItemSlot(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal memindahkan slot jadwal draft' });
  });
});

// ── changeItemAssignment ──────────────────────────────────────────────────────
describe('scheduleController.changeItemAssignment', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json', async () => {
    scheduleBatchService.changeDraftScheduleAssignment.mockResolvedValue({ changed: true });
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await scheduleController.changeItemAssignment(req, res);
    expect(res.json).toHaveBeenCalledWith({ changed: true });
  });
  test('error → 500', async () => {
    scheduleBatchService.changeDraftScheduleAssignment.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { id: '1' }, body: {} });
    const res = mockResponse();
    await scheduleController.changeItemAssignment(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal mengganti pengampu jadwal draft' });
  });
});

// ── submitBatch ───────────────────────────────────────────────────────────────
describe('scheduleController.submitBatch', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json dengan message dan batch', async () => {
    scheduleBatchService.submitScheduleBatch.mockResolvedValue({ id: 'b1', status: 'pending' });
    const req = mockRequest({ params: { batchId: 'b1' }, body: { notes: 'OK' }, user: USER });
    const res = mockResponse();
    await scheduleController.submitBatch(req, res);
    expect(scheduleBatchService.submitScheduleBatch).toHaveBeenCalledWith({ batchId: 'b1', actorId: 1, notes: 'OK' });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Batch jadwal berhasil diajukan untuk pengesahan',
      batch: { id: 'b1', status: 'pending' }
    });
  });
  test('error → 500', async () => {
    scheduleBatchService.submitScheduleBatch.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { batchId: 'b1' }, body: {}, user: USER });
    const res = mockResponse();
    await scheduleController.submitBatch(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal mengajukan batch jadwal' });
  });
});

// ── approveBatch ──────────────────────────────────────────────────────────────
describe('scheduleController.approveBatch', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json dengan message dan batch', async () => {
    scheduleBatchService.approveScheduleBatch.mockResolvedValue({ id: 'b1', status: 'approved' });
    const req = mockRequest({ params: { batchId: 'b1' }, body: {}, user: USER });
    const res = mockResponse();
    await scheduleController.approveBatch(req, res);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Batch jadwal berhasil disetujui',
      batch: { id: 'b1', status: 'approved' }
    });
  });
  test('error → 500', async () => {
    scheduleBatchService.approveScheduleBatch.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { batchId: 'b1' }, body: {}, user: USER });
    const res = mockResponse();
    await scheduleController.approveBatch(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menyetujui batch jadwal' });
  });
});

// ── rejectBatch ───────────────────────────────────────────────────────────────
describe('scheduleController.rejectBatch', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → res.json dengan message dan batch', async () => {
    scheduleBatchService.rejectScheduleBatch.mockResolvedValue({ id: 'b1', status: 'rejected' });
    const req = mockRequest({ params: { batchId: 'b1' }, body: { notes: 'Ditolak' }, user: USER });
    const res = mockResponse();
    await scheduleController.rejectBatch(req, res);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Batch jadwal berhasil ditolak',
      batch: { id: 'b1', status: 'rejected' }
    });
  });
  test('error → 500', async () => {
    scheduleBatchService.rejectScheduleBatch.mockRejectedValue(new Error('err'));
    const req = mockRequest({ params: { batchId: 'b1' }, body: {}, user: USER });
    const res = mockResponse();
    await scheduleController.rejectBatch(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal menolak batch jadwal' });
  });
});

// ── exportSchedule ────────────────────────────────────────────────────────────
describe('scheduleController.exportSchedule', () => {
  beforeEach(() => jest.clearAllMocks());
  test('berhasil → setHeader + res.send', async () => {
    const buf = Buffer.from('xlsx-data');
    scheduleBatchService.exportScheduleItems.mockResolvedValue({
      buffer: buf, mimeType: 'application/xlsx', filename: 'jadwal.xlsx'
    });
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.exportSchedule(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/xlsx');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="jadwal.xlsx"');
    expect(res.send).toHaveBeenCalledWith(buf);
  });
  test('error → 500', async () => {
    scheduleBatchService.exportScheduleItems.mockRejectedValue(new Error('err'));
    const req = mockRequest({ query: {}, user: USER });
    const res = mockResponse();
    await scheduleController.exportSchedule(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Gagal mengekspor jadwal' });
  });
});
