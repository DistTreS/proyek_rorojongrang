const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { ACCESS } = require('../config/rbac');
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

router.get('/', auth, authorize(ACCESS.attendance.view), list);
router.get('/summary', auth, authorize(ACCESS.attendance.view), summary);
router.get('/meetings', auth, authorize(ACCESS.attendance.view), listMeetings);
router.get('/meetings/:meetingId', auth, authorize(ACCESS.attendance.view), detailMeeting);
router.post('/meetings', auth, authorize(ACCESS.attendance.manage), createMeeting);
router.put('/meetings/:meetingId/entries', auth, authorize(ACCESS.attendance.manage), updateMeetingEntries);
router.post('/meetings/:meetingId/students/:studentId/attachment', auth, authorize(ACCESS.attendance.manage), upload.single('file'), uploadMeetingAttachment);
router.delete('/meetings/:meetingId', auth, authorize(ACCESS.attendance.manage), deleteMeeting);
router.post('/', auth, authorize(ACCESS.attendance.manage), create);
router.put('/:id', auth, authorize(ACCESS.attendance.manage), update);
router.delete('/:id', auth, authorize(ACCESS.attendance.manage), remove);

module.exports = router;
