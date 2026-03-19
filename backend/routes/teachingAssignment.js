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
} = require('../controllers/teachingAssignmentController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.teachingAssignment.view), list);
router.get('/:id', auth, authorize(ACCESS.teachingAssignment.view), detail);
router.post('/', auth, authorize(ACCESS.teachingAssignment.manage), create);
router.put('/:id', auth, authorize(ACCESS.teachingAssignment.manage), update);
router.delete('/:id', auth, authorize(ACCESS.teachingAssignment.manage), remove);

module.exports = router;
