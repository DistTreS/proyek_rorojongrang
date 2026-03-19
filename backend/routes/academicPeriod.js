const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const {
  list,
  detail,
  create,
  update,
  remove
} = require('../controllers/academicPeriodController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.academicPeriod.view), list);
router.get('/:id', auth, authorize(ACCESS.academicPeriod.view), detail);
router.post('/', auth, authorize(ACCESS.academicPeriod.manage), create);
router.put('/:id', auth, authorize(ACCESS.academicPeriod.manage), update);
router.delete('/:id', auth, authorize(ACCESS.academicPeriod.manage), remove);

module.exports = router;
