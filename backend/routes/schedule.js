const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { list, generate } = require('../controllers/scheduleController');

const router = express.Router();

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.post('/generate', auth, authorize('super_admin', 'wakasek'), generate);

module.exports = router;
