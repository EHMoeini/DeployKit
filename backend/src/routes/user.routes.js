import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
    uploadAvatarHandler,
    serveFileHandler,
    recordShatterEvent,
} from '../controllers/user.controller.js';
import { uploadAvatar } from '../middleware/upload.middleware.js';

const router = Router();

// ثبت رویداد تعاملی کاربر (Protected)
router.post('/me/shatter', requireAuth, recordShatterEvent);
router.post('/users/me/shatter', requireAuth, recordShatterEvent);
router.post('/user/shatter', requireAuth, recordShatterEvent);

// آپلود آواتار (Protected)
router.post('/me/avatar', requireAuth, uploadAvatar, uploadAvatarHandler);
router.post('/users/me/avatar', requireAuth, uploadAvatar, uploadAvatarHandler);
router.post('/user/avatar', requireAuth, uploadAvatar, uploadAvatarHandler);

// دریافت فایل عمومی بر اساس نام ذخیره‌شده
router.get('/files/:filename', serveFileHandler);

export default router;
