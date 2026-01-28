const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  list,
  detail,
  create,
  update,
  remove
} = require('../controllers/tendikController');

const router = express.Router();

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'staff_tu'), list);
router.get('/:id', auth, authorize('super_admin', 'kepala_sekolah', 'staff_tu'), detail);
router.post('/', auth, authorize('super_admin', 'kepala_sekolah', 'staff_tu'), create);
router.put('/:id', auth, authorize('super_admin', 'kepala_sekolah', 'staff_tu'), update);
router.delete('/:id', auth, authorize('super_admin', 'kepala_sekolah', 'staff_tu'), remove);

module.exports = router;
