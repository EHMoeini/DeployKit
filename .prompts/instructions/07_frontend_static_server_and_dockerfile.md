# دستورالعمل ۰۷: سرور فایل استاتیک بدون Nginx و داکرفایل فرانت‌اند

این سند نحوه ساخت وب‌سرور سبک اختصاصی فرانت‌اند (با رعایت تفکیک قطعی کدهای 404 واقعی برای فایل‌های دارای پسوند از SPA Fallback)، اسکریپت راه‌اندازی زمان اجرا (`entrypoint.sh`) و Dockerfile بهینه‌سازی‌شده چندمرحله‌ای (Multi-stage) را با سطح دسترسی کاربر غیر روت مشخص می‌کند.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `06`.
- خروجی بیلد Vite در مسیر `frontend/dist/` قابل تولید باشد.

---

## ۲. گام‌های اجرایی

### ۲.۱. سرور فایل استاتیک اختصاصی بدون Nginx (`frontend/server.js`)
طبق قوانین پروژه، استفاده از Nginx ممنوع است. سرور زیر با استفاده از ماژول استاندارد `http` در Node.js پیاده‌سازی شده و قانون حیاتی تفکیک فایل‌های ناموجود را رعایت می‌کند:

```javascript
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = parseInt(process.env.PORT || '8080', 10);

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
  // مسیرهای Health Check کانتینر
  if (req.url === '/health/live' || req.url === '/health/ready') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'frontend-static-server' }));
  }

  // نادیده گرفتن درخواست‌های API (در صورت ارسال اشتباه)
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
```

---

### ۲.۲. اسکریپت راه‌اندازی زمان اجرا (`frontend/entrypoint.sh`)
این اسکریپت قبل از شروع سرور، فایل `/config.js` را از روی متغیرهای محیطی تولید کرده و اطمینان می‌دهد که دسترسی کاربر غیر روت حفظ شود:

```bash
#!/bin/sh
set -e

CONFIG_FILE="/app/dist/config.js"

echo "[FRONTEND-ENTRYPOINT] Generating runtime configuration..."

# تولید فایل config.js بر پایه متغیرهای محیطی کانتینر
cat <<EOF > "$CONFIG_FILE"
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL:-/api/v1}",
  PROJECT_NAME: "${PROJECT_NAME:-User Portal}"
};
EOF

echo "[FRONTEND-ENTRYPOINT] Runtime configuration successfully written to $CONFIG_FILE"

# اجرای سرور استاتیک
exec node server.js
```

---

### ۲.۳. داکرفایل چندمرحله‌ای فرانت‌اند (`frontend/Dockerfile`)
ساخت تصویر بهینه، کوچک و امن با سطح دسترسی کاربر غیر روت (`node`):

```dockerfile
# ==============================================================================
# Stage 1: Build Stage
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# نصب پکیج‌ها با تفکیک لایه‌ها جهت کش بهینه
COPY package.json package-lock.json* ./
RUN npm ci

# کپی کد منبع و بیلد SPA
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Minimal Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# کپی خروجی بیلد و سرور استاتیک
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY entrypoint.sh ./

# اعطای دسترسی‌های لازم به کاربر غیر روت (node)
RUN chmod +x ./entrypoint.sh && \
    chown -R node:node /app

# جابه‌جایی به کاربر غیر روت
USER node

EXPOSE 8080

# بررسی سلامت کانتینر
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health/live || exit 1

ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۷
- [ ] درخواست یک فایل جاوااسکریپت ناموجود (مانند `/assets/missing.js`) منجر به بازگشت `404 Not Found` شود (نه محتوای `index.html`).
- [ ] درخواست مسیر بدون پسوند (مانند `/dashboard`) محتوای `index.html` را برای SPA Router ارسال کند.
- [ ] اسکریپت `entrypoint.sh` در کانتینر با کاربر `node` بدون خطای `Permission Denied` فایل `dist/config.js` را تولید کند.
- [ ] بررسی سلامت (`HEALTHCHECK`) کانتینر وضعیت `healthy` را گزارش کند.
- [ ] هیچ اثری از وب‌سرور Nginx در فرآیند بیلد یا اجرای کانتینر وجود نداشته باشد.
