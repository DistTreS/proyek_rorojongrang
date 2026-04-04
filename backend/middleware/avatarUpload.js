const fs = require('fs');
const path = require('path');
const multer = require('multer');

const AVATAR_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
const MAX_AVATAR_SIZE = Number(process.env.MAX_AVATAR_SIZE || 2 * 1024 * 1024);

if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
  fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_UPLOAD_DIR),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeExtension = extension && extension.length <= 6 ? extension : '.jpg';
    const uniqueName = `user-${req.user?.id || 'unknown'}-${Date.now()}${safeExtension}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (!file?.mimetype?.startsWith('image/')) {
    return cb(new Error('INVALID_AVATAR_FILE_TYPE'));
  }
  return cb(null, true);
};

const uploadSingleAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_AVATAR_SIZE }
}).single('avatar');

const avatarUpload = (req, res, next) => {
  uploadSingleAvatar(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Ukuran foto profil maksimal 2 MB' });
    }

    if (err.message === 'INVALID_AVATAR_FILE_TYPE') {
      return res.status(400).json({ message: 'Foto profil harus berupa file gambar' });
    }

    return res.status(400).json({ message: 'Upload foto profil gagal' });
  });
};

module.exports = {
  avatarUpload
};
