const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const {
  list,
  listBatches,
  batchDetail,
  validate,
  generate,
  updateItem,
  moveItemSlot,
  changeItemAssignment,
  exportSchedule,
  submitBatch,
  approveBatch,
  rejectBatch,
  deleteBatch
} = require('../controllers/scheduleController');

const router = express.Router();

router.get('/batches', auth, authorize(ACCESS.schedule.view), listBatches);
router.get('/batches/:batchId', auth, authorize(ACCESS.schedule.view), batchDetail);
router.get('/export', auth, authorize(ACCESS.schedule.view), exportSchedule);
router.get('/', auth, authorize(ACCESS.schedule.view), list);
router.get('/validate', auth, authorize(ACCESS.schedule.manage), validate);
router.post('/validate', auth, authorize(ACCESS.schedule.manage), validate);
router.post('/generate', auth, authorize(ACCESS.schedule.manage), generate);
router.post('/batches/:batchId/submit', auth, authorize(ACCESS.schedule.submit), submitBatch);
router.post('/batches/:batchId/approve', auth, authorize(ACCESS.schedule.approve), approveBatch);
router.post('/batches/:batchId/reject', auth, authorize(ACCESS.schedule.approve), rejectBatch);
router.delete('/batches/:batchId', auth, authorize(ACCESS.schedule.manage), deleteBatch);
router.put('/:id/move-slot', auth, authorize(ACCESS.schedule.manage), moveItemSlot);
router.put('/:id/change-assignment', auth, authorize(ACCESS.schedule.manage), changeItemAssignment);
router.put('/:id', auth, authorize(ACCESS.schedule.manage), updateItem);

module.exports = router;
