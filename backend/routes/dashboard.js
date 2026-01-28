const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { overview } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/overview', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), overview);

module.exports = router;
