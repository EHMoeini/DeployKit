import { StorageService } from '../services/storage.service.js';
import { query } from '../config/db.js';

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
