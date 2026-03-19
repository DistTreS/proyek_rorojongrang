const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const {
  list,
  create,
  update,
  remove
} = require('../controllers/studentNoteController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.studentNote.view), list);
router.post('/', auth, authorize(ACCESS.studentNote.manage), create);
router.put('/:id', auth, authorize(ACCESS.studentNote.manage), update);
router.delete('/:id', auth, authorize(ACCESS.studentNote.manage), remove);

module.exports = router;
