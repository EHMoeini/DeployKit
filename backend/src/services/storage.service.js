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
