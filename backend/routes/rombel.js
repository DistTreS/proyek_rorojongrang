const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { list, detail, create, update, remove } = require('../controllers/rombelController');

const router = express.Router();

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.get('/:id', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), detail);
router.post('/', auth, authorize('super_admin', 'wakasek'), create);
router.put('/:id', auth, authorize('super_admin', 'wakasek'), update);
router.delete('/:id', auth, authorize('super_admin', 'wakasek'), remove);

module.exports = router;
