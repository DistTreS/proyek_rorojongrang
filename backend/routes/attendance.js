const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  list,
  listMeetings,
  detailMeeting,
  createMeeting,
  updateMeetingEntries,
  uploadMeetingAttachment,
  deleteMeeting,
  create,
  update,
  remove,
  summary
} = require('../controllers/attendanceController');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'attendance');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;
    cb(null, unique);
  }
});

const upload = multer({ storage });

router.get('/', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), list);
router.get('/summary', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), summary);
router.get('/meetings', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), listMeetings);
router.get('/meetings/:meetingId', auth, authorize('super_admin', 'kepala_sekolah', 'wakasek', 'staff_tu', 'guru'), detailMeeting);
router.post('/meetings', auth, authorize('super_admin', 'guru'), createMeeting);
router.put('/meetings/:meetingId/entries', auth, authorize('super_admin', 'guru'), updateMeetingEntries);
router.post('/meetings/:meetingId/students/:studentId/attachment', auth, authorize('super_admin', 'guru'), upload.single('file'), uploadMeetingAttachment);
router.delete('/meetings/:meetingId', auth, authorize('super_admin', 'guru'), deleteMeeting);
router.post('/', auth, authorize('super_admin', 'guru'), create);
router.put('/:id', auth, authorize('super_admin', 'guru'), update);
router.delete('/:id', auth, authorize('super_admin', 'guru'), remove);

module.exports = router;
