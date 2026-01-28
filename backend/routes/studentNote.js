const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  list,
  create,
  update,
  remove
} = require('../controllers/studentNoteController');

const router = express.Router();

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.post('/', auth, authorize('super_admin', 'staff_tu', 'guru'), create);
router.put('/:id', auth, authorize('super_admin', 'staff_tu', 'guru'), update);
router.delete('/:id', auth, authorize('super_admin', 'staff_tu', 'guru'), remove);

module.exports = router;
