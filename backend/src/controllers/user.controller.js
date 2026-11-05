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
        if (err.message && err.message.includes('PATH_TRAVERSAL')) {
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
