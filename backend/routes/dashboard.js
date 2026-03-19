const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const { overview } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/overview', auth, authorize(ACCESS.dashboard.view), overview);

module.exports = router;
