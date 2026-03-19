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
} = require('../controllers/teacherPreferenceController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.teacherPreference.view), list);
router.get('/:id', auth, authorize(ACCESS.teacherPreference.view), detail);
router.post('/', auth, authorize(ACCESS.teacherPreference.manage), create);
router.put('/:id', auth, authorize(ACCESS.teacherPreference.manage), update);
router.delete('/:id', auth, authorize(ACCESS.teacherPreference.manage), remove);

module.exports = router;
