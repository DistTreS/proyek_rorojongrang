const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { avatarUpload } = require('../middleware/avatarUpload');
const { ACCESS } = require('../config/rbac');
const {
  me,
  updateMe,
  list,
  detail,
  create,
  update,
  remove
} = require('../controllers/userController');

const router = express.Router();

router.get('/me', auth, authorize(ACCESS.users.me), me);
router.put('/me', auth, authorize(ACCESS.users.me), avatarUpload, updateMe);
router.get('/', auth, authorize(ACCESS.users.admin), list);
router.get('/:id', auth, authorize(ACCESS.users.admin), detail);
router.post('/', auth, authorize(ACCESS.users.admin), create);
router.put('/:id', auth, authorize(ACCESS.users.admin), update);
router.delete('/:id', auth, authorize(ACCESS.users.admin), remove);

module.exports = router;
