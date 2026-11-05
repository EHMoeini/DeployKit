import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = parseInt(process.env.PORT || '8080', 10);
const POD_ID = process.env.POD_NAME || process.env.HOSTNAME || 'pod-frontend';

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    // درج هدر پاد در تمامی پاسخ‌ها
    res.setHeader('x-pod-id', POD_ID);
    res.setHeader('Access-Control-Expose-Headers', 'x-pod-id');

    // مسیرهای Health Check کانتینر
    if (req.url === '/health/live' || req.url === '/health/ready') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'ok', service: 'frontend-static-server', podId: POD_ID }));
    }

    // نادیده گرفتن درخواست‌های API (در صورت ارسال اشتباه به فرانت)
    if (req.url.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'API route not handled by static file server' }));
    }

    // تمیز کردن مسیر از Query String
    const urlPath = req.url.split('?')[0];
    const safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);

    // بررسی وضعیت فایل روی دیسک
    fs.stat(filePath, (err, stats) => {
        // ۱. اگر فایل وجود دارد و یک فایل است (نه دایرکتوری)، آن را سرو کن
        if (!err && stats.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            // تنظیم هدرهای Cache (برای فایل‌های دارای هش تا ۱ سال، برای index.html بدون کش)
            if (ext === '.html') {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }

            res.writeHead(200, { 'Content-Type': contentType });
            const stream = fs.createReadStream(filePath);
            return stream.pipe(res);
        }

        // ۲. قانون حیاتی: اگر درخواست دارای پسوند فایل است ولی وجود ندارد، صریحاً 404 برگردان!
        const ext = path.extname(urlPath).toLowerCase();
        if (ext && ext !== '') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
            return res.end(`404 Not Found: Static asset ${urlPath} was not found on this server.`);
        }

        // ۳. اگر مسیر فاقد پسوند فایل است (مانند /dashboard یا /login)، فایل index.html را برگردان (SPA Fallback)
        const indexPath = path.join(DIST_DIR, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
            if (indexErr) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
                return res.end('500 Internal Server Error: index.html missing from dist directory.');
            }
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
            return res.end(indexData);
        });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[FRONTEND] Static server running on port ${PORT} without Nginx.`);
});
