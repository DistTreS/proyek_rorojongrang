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
} = require('../controllers/subjectController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.subject.view), list);
router.get('/:id', auth, authorize(ACCESS.subject.view), detail);
router.post('/', auth, authorize(ACCESS.subject.manage), create);
router.put('/:id', auth, authorize(ACCESS.subject.manage), update);
router.delete('/:id', auth, authorize(ACCESS.subject.manage), remove);

module.exports = router;
