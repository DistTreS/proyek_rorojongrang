const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
const {
  list,
  detail,
  create,
  update,
  remove,
  importExcel,
  downloadTemplate
} = require('../controllers/studentController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', auth, authorize(ACCESS.siswa.view), list);
router.get('/template', auth, authorize(ACCESS.siswa.manage), downloadTemplate);
router.post('/import', auth, authorize(ACCESS.siswa.manage), upload.single('file'), importExcel);
router.get('/:id', auth, authorize(ACCESS.siswa.view), detail);
router.post('/', auth, authorize(ACCESS.siswa.manage), create);
router.put('/:id', auth, authorize(ACCESS.siswa.manage), update);
router.delete('/:id', auth, authorize(ACCESS.siswa.manage), remove);

module.exports = router;
