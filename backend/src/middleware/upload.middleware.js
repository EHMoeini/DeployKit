import multer from 'multer';

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10) * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('INVALID_FILE_TYPE: Only JPEG, PNG, WEBP and SVG images are allowed!'), false);
    }
};

export const uploadAvatar = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter,
}).single('avatar');
