const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
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

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.get('/template', auth, authorize('super_admin', 'staff_tu'), downloadTemplate);
router.post('/import', auth, authorize('super_admin', 'staff_tu'), upload.single('file'), importExcel);
router.get('/:id', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), detail);
router.post('/', auth, authorize('super_admin', 'staff_tu'), create);
router.put('/:id', auth, authorize('super_admin', 'staff_tu'), update);
router.delete('/:id', auth, authorize('super_admin', 'staff_tu'), remove);

module.exports = router;
