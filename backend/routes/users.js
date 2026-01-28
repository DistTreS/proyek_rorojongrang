const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { me } = require('../controllers/userController');

const router = express.Router();

router.get('/me', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), me);

module.exports = router;
