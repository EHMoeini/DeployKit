import { Router } from 'express';
import { serveFileHandler } from '../controllers/user.controller.js';

const router = Router();

// دریافت فایل عمومی بر اساس نام ذخیره‌شده
router.get('/files/:filename', serveFileHandler);

export default router;
