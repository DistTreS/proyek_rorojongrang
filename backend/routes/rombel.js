const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const { list, detail, create, update, remove, assignStudents, removeStudent } = require('../controllers/rombelController');

const router = express.Router();

router.get('/', auth, authorize(ACCESS.rombel.view), list);
router.get('/:id', auth, authorize(ACCESS.rombel.view), detail);
router.put('/:id/students', auth, authorize(ACCESS.rombel.manage), assignStudents);
router.delete('/:id/students/:studentId', auth, authorize(ACCESS.rombel.manage), removeStudent);
router.post('/', auth, authorize(ACCESS.rombel.manage), create);
router.put('/:id', auth, authorize(ACCESS.rombel.manage), update);
router.delete('/:id', auth, authorize(ACCESS.rombel.manage), remove);

module.exports = router;
