# دستورالعمل ۰۴: انتزاع ذخیره‌سازی فایل مشترک، آپلود آواتار و API ثبت رویداد تعاملی کاربر

این سند پیاده‌سازی لایه انتزاعی ذخیره‌سازی فایل‌ها روی Persistent Volume مشترک، جلوگیری از حملات Path Traversal، ثبت متادیتا در PostgreSQL و همچنین Endpoint افزایش شمارنده اقدامات کاربر (`shatter_count`) و سیستم اختیاری صف کارهای پس‌زمینه (Background Jobs) بدون Redis را پوشش می‌دهد.

---

## ۱. پیش‌نیازها
- اجرای کامل `01`، `02` و `03`.
- دیتابیس PostgreSQL با جدول `files` و ستون `shatter_count` در جدول `users`.

---

## ۲. گام‌های اجرایی

### ۲.۱. لایه انتزاعی ذخیره‌سازی فایل (`backend/src/services/storage.service.js`)
برای رعایت قابلیت تعویض درایور ذخیره‌سازی (از دیسک محلی به Object Storage سازگار با S3)، یک سرویس انتزاعی با رعایت کامل امنیت نام‌گذاری ایجاد کن:

```javascript
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../config/db.js';

const STORAGE_PATH = process.env.SHARED_STORAGE_PATH || path.resolve(process.cwd(), 'uploads');

// اطمینان از وجود دایرکتوری ذخیره‌سازی
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

export const StorageService = {
  /**
   * ذخیره فایل در دیسک مشترک با نام UUID و ثبت متادیتا در PostgreSQL
   */
  async saveFile({ userId, originalFilename, buffer, mimeType }) {
    // جلوگیری از حملات Path Traversal و استفاده از UUID برای نام فایل روی دیسک
    const fileExt = path.extname(originalFilename).toLowerCase();
    const storedFilename = `${crypto.randomUUID()}${fileExt}`;
    const destination = path.join(STORAGE_PATH, storedFilename);

    // بررسی امنیتی مسیر نهایی (Path Traversal Guard)
    const normalized = path.normalize(destination);
    if (!normalized.startsWith(path.normalize(STORAGE_PATH))) {
      throw new Error('SECURITY_PATH_TRAVERSAL_DETECTED');
    }

    // نوشتن فایل روی دیسک
    await fs.promises.writeFile(destination, buffer);

    // ثبت در پایگاه داده
    const dbRes = await query(
      `INSERT INTO files (user_id, original_filename, stored_filename, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, original_filename, stored_filename, file_size, mime_type, created_at`,
      [userId, originalFilename, storedFilename, buffer.length, mimeType]
    );

    return dbRes.rows[0];
  },

  /**
   * خواندن فایل با محافظت Path Traversal
   */
  async getFilePath(storedFilename) {
    // پاک‌سازی ورودی از کاراکترهای خطرناک
    const cleanName = path.basename(storedFilename);
    const destination = path.join(STORAGE_PATH, cleanName);

    const normalized = path.normalize(destination);
    if (!normalized.startsWith(path.normalize(STORAGE_PATH))) {
      throw new Error('SECURITY_PATH_TRAVERSAL_DETECTED');
    }

    if (!fs.existsSync(destination)) {
      return null;
    }

    return destination;
  },

  /**
   * حذف فیزیکی و لاجیکال فایل
   */
  async deleteFile(fileId, userId) {
    const fileRes = await query(
      'SELECT id, stored_filename FROM files WHERE id = $1 AND user_id = $2',
      [fileId, userId]
    );

    if (fileRes.rows.length === 0) return false;

    const { stored_filename } = fileRes.rows[0];
    const filePath = path.join(STORAGE_PATH, stored_filename);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }

    await query('DELETE FROM files WHERE id = $1', [fileId]);
    return true;
  },
};
```

---

### ۲.۲. میدل‌ور آپلود فایل (`backend/src/middleware/upload.middleware.js`)
با استفاده از `multer`، فایل را در حافظه RAM کانتینر تحویل گرفته و قبل از ذخیره، فرمت و حجم آن را کنترل کن:

```javascript
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
```

---

### ۲.۳. کنترلر مدیریت فایل و رویداد کاربر (`backend/src/controllers/user.controller.js`)

```javascript
import { StorageService } from '../services/storage.service.js';
import { query } from '../config/db.js';

/**
 * آپلود تصویر پروفایل (آواتار)
 */
export const uploadAvatarHandler = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const fileRecord = await StorageService.saveFile({
      userId: req.user.sub,
      originalFilename: req.file.originalname,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    // به‌روزرسانی کلید خارجی در جدول کاربران
    await query('UPDATE users SET avatar_file_id = $1 WHERE id = $2', [
      fileRecord.id,
      req.user.sub,
    ]);

    return res.status(201).json({
      message: 'Avatar uploaded successfully',
      avatarUrl: `/api/v1/files/${fileRecord.stored_filename}`,
      file: fileRecord,
    });
  } catch (err) {
    console.error('[STORAGE] Upload error:', err);
    if (err.message.includes('PATH_TRAVERSAL')) {
      return res.status(403).json({ error: 'Security violation: Path Traversal' });
    }
    return res.status(500).json({ error: 'File upload failed' });
  }
};

/**
 * دریافت فایل با تعیین MIME Type صحیح
 */
export const serveFileHandler = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = await StorageService.getFilePath(filename);

    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileRes = await query('SELECT mime_type FROM files WHERE stored_filename = $1', [
      filename,
    ]);
    if (fileRes.rows.length > 0) {
      res.setHeader('Content-Type', fileRes.rows[0].mime_type);
    }

    return res.sendFile(filePath);
  } catch (err) {
    return res.status(404).json({ error: 'File not found or access denied' });
  }
};

/**
 * افزایش شمارنده shatter_count در دیتابیس بر اثر کلیک کاربر
 */
export const recordShatterEvent = async (req, res) => {
  try {
    const updateRes = await query(
      `UPDATE users
       SET shatter_count = shatter_count + 1, updated_at = NOW()
       WHERE id = $1
       RETURNING id, display_name, shatter_count`,
      [req.user.sub]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      message: 'Shatter event recorded',
      shatter_count: updateRes.rows[0].shatter_count,
    });
  } catch (err) {
    console.error('[USER] Shatter count error:', err);
    return res.status(500).json({ error: 'Failed to record shatter count' });
  }
};
```

---

### ۲.۴. اتصال مسیرها در `backend/src/routes/user.routes.js`

```javascript
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

// آپلود آواتار (Protected)
router.post('/me/avatar', requireAuth, uploadAvatar, uploadAvatarHandler);

// دریافت فایل عمومی بر اساس نام ذخیره‌شده
router.get('/files/:filename', serveFileHandler);

export default router;
```

---

### ۲.۵. موتور پردازش صف کارهای پس‌زمینه بدون Redis (`backend/src/services/job_queue.service.js`)
در صورت نیاز به اجرای Taskهای ناهمگام (ارسال ایمیل، پردازش تصویر)، از الگوی `FOR UPDATE SKIP LOCKED` در PostgreSQL استفاده کن:

```javascript
import { getClient, query } from '../config/db.js';

export const enqueueJob = async (queueName, payload) => {
  const res = await query(
    `INSERT INTO background_jobs (queue_name, payload, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, status, created_at`,
    [queueName, JSON.stringify(payload)]
  );
  return res.rows[0];
};

export const fetchAndLockNextJob = async (queueName, workerLeaseSeconds = 60) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // قفل ردیف بدون انتظار (Skip Locked) جهت جلوگیری از Race Condition بین چند Worker
    const selectRes = await client.query(
      `SELECT id, payload, attempts, max_attempts
       FROM background_jobs
       WHERE queue_name = $1
         AND (status = 'pending' OR (status = 'processing' AND locked_until < NOW()))
         AND run_at <= NOW()
       ORDER BY run_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [queueName]
    );

    if (selectRes.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    const job = selectRes.rows[0];
    await client.query(
      `UPDATE background_jobs
       SET status = 'processing',
           attempts = attempts + 1,
           locked_until = NOW() + ($1 || ' seconds')::INTERVAL,
           updated_at = NOW()
       WHERE id = $2`,
      [workerLeaseSeconds, job.id]
    );

    await client.query('COMMIT');
    return job;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const markJobCompleted = async (jobId) => {
  await query("UPDATE background_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1", [jobId]);
};

export const markJobFailed = async (jobId, errorMsg) => {
  await query(
    `UPDATE background_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         run_at = NOW() + (POWER(2, attempts) || ' seconds')::INTERVAL, -- Exponential Backoff
         error_message = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, errorMsg]
  );
};
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۴
- [ ] ذخیره فایل‌ها در دیسک صرفاً با نام تصادفی UUID انجام شده و نام اصلی در DB ثبت شود.
- [ ] تست حمله Path Traversal (ارسال `../../etc/passwd`) به صورت خودکار رد شود.
- [ ] ارسال درخواست به `POST /api/v1/users/me/shatter` شمارنده `shatter_count` را به صورت اتمیک یک واحد افزایش دهد.
- [ ] بازیابی فایل از `GET /api/v1/files/:filename` با هدر `Content-Type` معتبر انجام گیرد.
- [ ] در صورت استفاده از صف کارها، مکانیزم `FOR UPDATE SKIP LOCKED` مانع از تداخل چند Worker هم‌زمان شود.
