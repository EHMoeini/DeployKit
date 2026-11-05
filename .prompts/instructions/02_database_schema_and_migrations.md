# دستورالعمل ۰۲: طراحی پایگاه داده PostgreSQL، مدیریت اتصالات و سامانه مستقل Migration

این سند نحوه پیاده‌سازی Schema کامل دیتابیس در PostgreSQL، فرمول بودجه‌بندی Connection Pool، ایجاد رانر مستقل Migration و اعمال ساختار جداول مورد نیاز برنامه را تشریح می‌کند.

---

## ۱. پیش‌نیازها
- اجرای کامل `01_repository_scaffolding.md`.
- دایرکتوری‌های `backend/src/config/` و `backend/migrations/` ایجاد شده باشند.

---

## ۲. گام‌های اجرایی

### ۲.۱. فرمول بودجه‌بندی اتصالات (Connection Pool Budgeting)
در معماری چند Replica، سقف اتصالات پایگاه داده باید با فرمول زیر مدیریت شود:

$$\sum (\text{Replicas} \times \text{Pool\_Size}) + \text{Workers} \le \text{max\_connections} - \text{Reserved\_Superuser}$$

- اگر مقدار `max_connections` در PostgreSQL برابر با `100` باشد و `3` اتصال برای Superuser رزرو شود:
  - تعداد Replicaها: حداکثر تا `5` نمونه.
  - اندازه Pool هر کانتینر (`DB_POOL_MAX`): حداکثر `15` اتصال.
  - مجموع: $5 \times 15 = 75 \le 97$ (کاملاً ایمن در برابر خطای `too many connections`).

### ۲.۲. ماژول مدیریت اتصال دیتابیس (`backend/src/config/db.js`)
یک ماژول استاندارد با استفاده از درایور `pg` پیاده‌سازی کن که از متغیرهای محیطی استفاده کرده و قابلیت اجرای Query و مدیریت Transaction را فراهم سازد:

```javascript
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'portal_db',
  user: process.env.DB_USER || 'portal_user',
  password: process.env.DB_PASSWORD || 'secret',
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export const checkDatabaseHealth = async () => {
  const start = Date.now();
  const res = await pool.query('SELECT 1 AS healthy');
  return {
    healthy: res.rows[0].healthy === 1,
    latencyMs: Date.now() - start,
  };
};
```

---

### ۲.۳. فایل‌های اسکریپت Migration در `backend/migrations/`

#### فایل ۱: ایجاد جدول کاربران (`backend/migrations/001_create_users_table.sql`)
```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

#### فایل ۲: ایجاد جدول Refresh Tokenها و مدیریت Sessionها (`backend/migrations/002_create_refresh_tokens_table.sql`)
```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_family_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(token_family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
```

#### فایل ۳: ایجاد جدول فایل‌های ذخیره‌شده (`backend/migrations/003_create_files_table.sql`)
```sql
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL UNIQUE,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
```

#### فایل ۴: ایجاد جدول صف Background Jobs در صورت نیاز (`backend/migrations/004_create_background_jobs_table.sql`)
```sql
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(50) NOT NULL DEFAULT 'default',
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMPTZ NULL,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_processing
    ON background_jobs(status, run_at)
    WHERE status IN ('pending', 'processing');
```

#### فایل ۵: پاک‌سازی ستون‌های منسوخ در دیتابیس‌های موجود (`backend/migrations/005_remove_avatar_and_shatter.sql`)
برای هم‌تراز کردن دیتابیس‌هایی که پیش‌تر با ساختار قدیمی ساخته شده‌اند، ستون‌های بدون استفاده را به صورت Idempotent حذف کن:
```sql
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_avatar;

ALTER TABLE users
    DROP COLUMN IF EXISTS avatar_file_id;

ALTER TABLE users
    DROP COLUMN IF EXISTS shatter_count;
```

---

### ۲.۴. رانر مستقل Migration (`backend/src/config/run-migrations.js`)
این اسکریپت وظیفه دارد به صورت یک‌باره (One-shot) اجرا شود و از اجرای هم‌زمان توسط چند Replica جلوگیری کند:

```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClient } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function runMigrations() {
  console.log('[MIGRATE] Connecting to PostgreSQL...');
  const client = await getClient();

  try {
    // ایجاد جدول ردگیری Migrationها
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // خواندن فایل‌های Migration به ترتیب نام
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`[MIGRATE] Found ${files.length} migration files.`);

    for (const file of files) {
      const checkRes = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (checkRes.rows.length === 0) {
        console.log(`[MIGRATE] Applying migration: ${file}...`);
        const filePath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`[MIGRATE] Successfully applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[MIGRATE] Error applying ${file}, rolling back!`, err);
          throw err;
        }
      } else {
        console.log(`[MIGRATE] Skipping already applied: ${file}`);
      }
    }

    console.log('[MIGRATE] All migrations finished successfully.');
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigrations().catch((err) => {
  console.error('[MIGRATE] Fatal error running migrations:', err);
  process.exit(1);
});
```

---

## ۳. قوانین حیاتی ایمنی Migration
1. **ممنوعیت اجرای اتوماتیک در Startup وب‌سرور:** اسکریپت بالا هرگز نباید در فایل `backend/src/index.js` ایمپورت یا در زمان بالا آمدن سرور وب فراخوانی شود. اجرای آن صرفاً به‌صورت یک‌بارمصرف و توسط Ansible (با همان ایمیج بک‌اند) انجام می‌گیرد.
2. **پایداری داده‌ها و Backward Compatibility:** تغییرات Schema در نسخه‌های جدید نباید ستون‌های فعال را به صورت ناگهانی حذف کنند تا در طول Rolling Update، نمونه‌های نسخه قدیمی‌تر دچار خطا نشوند.

---

## ۴. چک‌لیست اعتبارسنجی گام ۰۲
- [ ] فایل `backend/src/config/db.js` اتصال و Health Check دیتابیس را پیاده کرده باشد.
- [ ] هر ۴ فایل SQL در `backend/migrations/` با ایندکس‌ها و Constraintهای صحیح ایجاد شده باشند.
- [ ] اسکریپت `run-migrations.js` به صورت مستقل تست شده و قابلیت ثبت در `schema_migrations` را داشته باشد.
- [ ] تراکنش‌های `BEGIN` / `COMMIT` / `ROLLBACK` در اجرای Migration تضمین شده باشند.
