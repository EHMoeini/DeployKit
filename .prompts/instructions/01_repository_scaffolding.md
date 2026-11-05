# دستورالعمل ۰۱: ایجاد اسکلت اولیه مخزن و پیکربندی‌های پایه

این سند اولین گام اجرایی است و وظیفه راه‌اندازی ساختار دایرکتوری‌ها، فایل‌های پیکربندی ریشه، متغیرهای محیطی نمونه و پکیج‌های پایه را بر عهده دارد.

---

## ۱. پیش‌نیازها
- مطالعه و تأیید کامل `00_overview_and_agent_rules.md`.
- عدم وجود تداخل در ساختار فعلی پروژه.

---

## ۲. گام‌های اجرایی

### ۲.۱. ایجاد ساختار دایرکتوری‌ها
عامل هوش مصنوعی باید دایرکتوری‌های زیر را در ریشه پروژه ایجاد کند:

```bash
mkdir -p .github/workflows
mkdir -p frontend/src/{assets,components,pages,router,services,styles,utils}
mkdir -p frontend/public
mkdir -p backend/src/{config,controllers,middleware,models,routes,services,utils}
mkdir -p backend/migrations
mkdir -p scripts
mkdir -p ansible/{inventory/{development,staging,production}/group_vars,playbooks,roles/{common,security,firewall,storage,docker,traefik,application,backup,watchtower},vault,docs}
mkdir -p docs
```

### ۲.۲. پیکربندی فایل جامع `.gitignore`
یک فایل `.gitignore` استاندارد در ریشه پروژه ایجاد کن که مانع ثبت فایل‌های حساس، خروجی‌های بیلد و دایرکتوری‌های داده در Git شود:

```gitignore
# Environment & Secrets
.env
.env.*
!.env.example
*.pem
*.key
ansible/vault/vault_pass.txt
ansible/vault/*.secret

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# Build outputs
frontend/dist/
backend/dist/
dist/
build/

# Runtime Data & Storage
/srv/
postgres/data/
uploads/
*.dump
*.tmp

# Traefik & SSL
acme.json
/srv/traefik/acme/

# Ansible artifacts
ansible/artifacts/
ansible/*.retry
*.log

# OS & Editor
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
*.swo
```

### ۲.۳. تعریف فایل متغیرهای محیطی نمونه (`.env.example`)
فایل `.env.example` را در ریشه پروژه ایجاد کن که کلیه متغیرهای مورد نیاز تمامی سرویس‌ها را با مستندسازی کامل پوشش دهد:

```env
# ==============================================================================
# General & Application Environment
# ==============================================================================
NODE_ENV=production
PROJECT_NAME=liquid-portal
DOMAIN=example.com
API_BASE_URL=/api/v1

# ==============================================================================
# Backend Configuration
# ==============================================================================
PORT=3000
BACKEND_REPLICAS=2

# Security & Secrets (Use strong random strings in real environment)
JWT_SECRET=super_secret_jwt_access_token_signing_key_at_least_32_chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=super_secret_refresh_token_hmac_key_at_least_32_chars
REFRESH_TOKEN_EXPIRES_DAYS=7
CSRF_SECRET=super_secret_csrf_token_signing_salt_key

# Database Connection (Internal Docker Network)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=portal_db
DB_USER=portal_user
DB_PASSWORD=strong_postgres_password_here
DB_POOL_MAX=10

# Storage Paths
SHARED_STORAGE_PATH=/srv/portal/uploads
MAX_FILE_SIZE_MB=5

# ==============================================================================
# PostgreSQL Persistence (Host Mount)
# ==============================================================================
PGDATA_HOST_PATH=/srv/portal/postgres/data
BACKUP_HOST_PATH=/srv/portal/backups/postgres

# ==============================================================================
# Traefik & SSL / TLS Configuration
# ==============================================================================
ACME_EMAIL=admin@example.com
TRAEFIK_ACME_STORAGE=/srv/traefik/acme/acme.json

# ==============================================================================
# GitHub Container Registry (CI/CD)
# ==============================================================================
GHCR_OWNER=your-github-username
GHCR_REPO=deploy-with-agent
IMAGE_TAG=latest
```

### ۲.۴. آماده‌سازی `package.json` در دایرکتوری `backend/`
یک `backend/package.json` استاندارد و بهینه‌سازی‌شده برای کار با Node.js (استفاده از ES Modules) با پکیج‌های سبک و استاندارد ایجاد کن:

```json
{
  "name": "portal-backend",
  "version": "1.0.0",
  "description": "Stateless REST API backend with PostgreSQL, JWT Auth, and File Uploads",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "migrate": "node src/config/run-migrations.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.5",
    "uuid": "^9.0.1"
  }
}
```

### ۲.۵. آماده‌سازی `package.json` در دایرکتوری `frontend/`
یک `frontend/package.json` بر پایه Vite و ساختار ماژولار SPA ایجاد کن:

```json
{
  "name": "portal-frontend",
  "version": "1.0.0",
  "description": "Modular True SPA frontend structure",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "serve": "node server.js"
  },
  "dependencies": {},
  "devDependencies": {
    "vite": "^5.2.11"
  }
}
```

### ۲.۶. آماده‌سازی اسکریپت ریشه `package.json` (اختیاری جهت سهولت توسعه)
در ریشه پروژه، یک فایل `package.json` جهت اجرای سریع دستورات و تست‌های محلی قرار بده:

```json
{
  "name": "deploy-with-agent-root",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "install:all": "cd backend && npm install && cd ../frontend && npm install",
    "test:local": "bash scripts/test_local.sh"
  }
}
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۱ (Validation Checklist)
پیش از عبور به مرحله بعدی، موارد زیر را بررسی و تأیید کن:
- [ ] ساختار کلیه پوشه‌ها طبق ساختار تعیین‌شده ایجاد شده باشد.
- [ ] فایل `.gitignore` کلیه مسیرهای حساس و بیلد را پوشش دهد.
- [ ] فایل `.env.example` فاقد مقادیر واقعی اما حاوی توضیحات کامل متغیرها باشد.
- [ ] فایل‌های `package.json` در `backend` و `frontend` با وابستگی‌های تعریف‌شده ایجاد شده باشند.
- [ ] هیچ فایل باینری، کلید یا داده حساسی وارد مخزن نشده باشد.
