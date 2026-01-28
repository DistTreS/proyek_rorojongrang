const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  list,
  create,
  update,
  remove,
  summary
} = require('../controllers/attendanceController');

const router = express.Router();

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.get('/summary', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), summary);
router.post('/', auth, authorize('super_admin', 'guru'), create);
router.put('/:id', auth, authorize('super_admin', 'guru'), update);
router.delete('/:id', auth, authorize('super_admin', 'guru'), remove);

module.exports = router;
