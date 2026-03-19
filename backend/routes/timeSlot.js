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
} = require('../controllers/timeSlotController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.timeSlot.view), list);
router.get('/:id', auth, authorize(ACCESS.timeSlot.view), detail);
router.post('/', auth, authorize(ACCESS.timeSlot.manage), create);
router.put('/:id', auth, authorize(ACCESS.timeSlot.manage), update);
router.delete('/:id', auth, authorize(ACCESS.timeSlot.manage), remove);

module.exports = router;
