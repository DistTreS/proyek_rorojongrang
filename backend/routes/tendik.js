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
} = require('../controllers/tendikController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', auth, authorize(ACCESS.tendik.view), list);
router.get('/template', auth, authorize(ACCESS.tendik.manage), downloadTemplate);
router.post('/import', auth, authorize(ACCESS.tendik.manage), upload.single('file'), importExcel);
router.get('/:id', auth, authorize(ACCESS.tendik.view), detail);
router.post('/', auth, authorize(ACCESS.tendik.manage), create);
router.put('/:id', auth, authorize(ACCESS.tendik.manage), update);
router.delete('/:id', auth, authorize(ACCESS.tendik.manage), remove);

module.exports = router;
