# دستورالعمل ۰۳: پیاده‌سازی هسته بک‌اند Stateless و موتور امنیتی احراز هویت

این سند پیاده‌سازی کامل وب‌سرور Stateless، نقاط پایانی Health Check و موتور احراز هویت امن شامل ترکیب **JWT Access Token** و **Opaque Refresh Token** با قابلیت چرخش (Rotation)، تشخیص استفاده مجدد (Reuse Detection)، پنجره مهلت (Grace Period) و محافظت CSRF را شرح می‌دهد.

---

## ۱. پیش‌نیازها
- اجرای موفق `01_repository_scaffolding.md` و `02_database_schema_and_migrations.md`.
- دیتابیس PostgreSQL با جداول `users` و `refresh_tokens` در دسترس باشد.

---

## ۲. گام‌های اجرایی

### ۲.۱. سرویس امنیتی و توابع کمکی احراز هویت (`backend/src/services/auth.service.js`)
این ماژول وظیفه هش کردن رمز عبور، تولید JWT، تولید Opaque Token با CSPRNG، محاسبه هش SHA-256 و مدیریت چرخه عمر توکن‌ها را بر عهده دارد:

```javascript
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, getClient } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '7', 10);
const GRACE_PERIOD_SECONDS = 10;

export const hashPassword = async (password) => bcrypt.hash(password, 10);

export const comparePassword = async (password, hash) => bcrypt.compare(password, hash);

export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      display_name: user.display_name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'portal-backend', audience: 'portal-app' }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'portal-backend',
    audience: 'portal-app',
  });
};

export const generateOpaqueToken = () => crypto.randomBytes(40).toString('hex');

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const createRefreshToken = async (userId, tokenFamilyId = null) => {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const familyId = tokenFamilyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

  const res = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, token_family_id, expires_at`,
    [userId, tokenHash, familyId, expiresAt]
  );

  return {
    rawToken,
    familyId: res.rows[0].token_family_id,
    expiresAt,
  };
};

export const rotateRefreshToken = async (oldRawToken) => {
  const oldHash = hashToken(oldRawToken);
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // جستجوی توکن
    const findRes = await client.query(
      `SELECT id, user_id, token_family_id, expires_at, revoked_at,
              EXTRACT(EPOCH FROM (NOW() - revoked_at)) AS seconds_since_revocation
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [oldHash]
    );

    if (findRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('TOKEN_NOT_FOUND');
    }

    const tokenRecord = findRes.rows[0];

    // اگر توکن قبلاً باطل شده است
    if (tokenRecord.revoked_at !== null) {
      const elapsed = parseFloat(tokenRecord.seconds_since_revocation || 0);

      // بررسی پنجره مهلت (Grace Period) برای درخواست‌های هم‌زمان شبکه
      if (elapsed <= GRACE_PERIOD_SECONDS) {
        // ایجاد توکن جدید مجاز در همان خانواده
        const newRawToken = generateOpaqueToken();
        const newHash = hashToken(newRawToken);
        const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

        await client.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, expires_at)
           VALUES ($1, $2, $3, $4)`,
          [tokenRecord.user_id, newHash, tokenRecord.token_family_id, expiresAt]
        );

        // دریافت اطلاعات کاربر
        const userRes = await client.query(
          'SELECT id, email, display_name FROM users WHERE id = $1',
          [tokenRecord.user_id]
        );

        await client.query('COMMIT');
        return {
          user: userRes.rows[0],
          newRawToken,
          expiresAt,
        };
      } else {
        // سرقت یا استفاده مجدد شناسایی شد! ابطال تمام توکن‌های خانواده
        console.warn(`[SECURITY] Token reuse detected for family ${tokenRecord.token_family_id}! Invalidation triggered.`);
        await client.query(
          'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_family_id = $1',
          [tokenRecord.token_family_id]
        );
        await client.query('COMMIT');
        throw new Error('TOKEN_REUSE_DETECTED');
      }
    }

    // بررسی تاریخ انقضا
    if (new Date(tokenRecord.expires_at) < new Date()) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
        [tokenRecord.id]
      );
      await client.query('COMMIT');
      throw new Error('TOKEN_EXPIRED');
    }

    // ابطال توکن فعلی
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [tokenRecord.id]
    );

    // صدور توکن جدید در همان خانواده
    const newRawToken = generateOpaqueToken();
    const newHash = hashToken(newRawToken);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenRecord.user_id, newHash, tokenRecord.token_family_id, expiresAt]
    );

    const userRes = await client.query(
      'SELECT id, email, display_name FROM users WHERE id = $1',
      [tokenRecord.user_id]
    );

    await client.query('COMMIT');
    return {
      user: userRes.rows[0],
      newRawToken,
      expiresAt,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const revokeRefreshToken = async (rawToken) => {
  const tokenHash = hashToken(rawToken);
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
};

export const revokeAllUserTokens = async (userId) => {
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [userId]);
};
```

---

### ۲.۲. میدل‌ورهای احراز هویت و محافظت CSRF (`backend/src/middleware/auth.middleware.js`)

```javascript
import crypto from 'crypto';
import { verifyAccessToken } from '../services/auth.service.js';

export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
};

export const generateCsrfToken = () => crypto.randomBytes(24).toString('hex');

export const verifyCsrf = (req, res, next) => {
  // مسیرهای Safe نیازی به CSRF ندارند
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieCsrf = req.cookies.csrf_token;
  const headerCsrf = req.headers['x-csrf-token'];

  if (!cookieCsrf || !headerCsrf || cookieCsrf !== headerCsrf) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }

  next();
};
```

---

### ۲.۳. کنترلر احراز هویت (`backend/src/controllers/auth.controller.js`)

```javascript
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '../services/auth.service.js';
import { generateCsrfToken } from '../middleware/auth.middleware.js';
import { query } from '../config/db.js';

const isProd = process.env.NODE_ENV === 'production';

const setAuthCookies = (res, rawRefreshToken, expiresAt) => {
  res.cookie('refresh_token', rawRefreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/api/v1/auth',
    expires: expiresAt,
  });

  const csrfToken = generateCsrfToken();
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false, // قابل خواندن توسط کلاینت جاوااسکریپت برای درج در هدر
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie('refresh_token', { path: '/api/v1/auth' });
  res.clearCookie('csrf_token', { path: '/' });
};

export const register = async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const checkUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const pwHash = await hashPassword(password);
    const userRes = await query(
      `INSERT INTO users (email, display_name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, shatter_count, created_at`,
      [email, display_name, pwHash]
    );

    const user = userRes.rows[0];
    const accessToken = generateAccessToken(user);
    const { rawToken, expiresAt } = await createRefreshToken(user.id);

    setAuthCookies(res, rawToken, expiresAt);
    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        shatter_count: user.shatter_count,
      },
      accessToken,
    });
  } catch (err) {
    console.error('[AUTH] Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const userRes = await query(
      'SELECT id, email, display_name, password_hash, shatter_count FROM users WHERE email = $1',
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const match = await comparePassword(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const { rawToken, expiresAt } = await createRefreshToken(user.id);

    setAuthCookies(res, rawToken, expiresAt);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        shatter_count: user.shatter_count,
      },
      accessToken,
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const refresh = async (req, res) => {
  const rawToken = req.cookies.refresh_token;
  if (!rawToken) {
    return res.status(401).json({ error: 'No refresh token provided' });
  }

  try {
    const { user, newRawToken, expiresAt } = await rotateRefreshToken(rawToken);
    const accessToken = generateAccessToken(user);

    setAuthCookies(res, newRawToken, expiresAt);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
      },
      accessToken,
    });
  } catch (err) {
    clearAuthCookies(res);
    if (err.message === 'TOKEN_REUSE_DETECTED') {
      return res.status(403).json({ error: 'Token theft detected! Session terminated.' });
    }
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};

export const logout = async (req, res) => {
  const rawToken = req.cookies.refresh_token;
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }
  clearAuthCookies(res);
  return res.json({ message: 'Logged out successfully' });
};

export const logoutAll = async (req, res) => {
  const rawToken = req.cookies.refresh_token;
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }
  await revokeAllUserTokens(req.user.sub);
  clearAuthCookies(res);
  return res.json({ message: 'All sessions revoked successfully' });
};

export const getMe = async (req, res) => {
  try {
    const userRes = await query(
      `SELECT u.id, u.email, u.display_name, u.shatter_count, f.stored_filename AS avatar_url
       FROM users u
       LEFT JOIN files f ON u.avatar_file_id = f.id
       WHERE u.id = $1`,
      [req.user.sub]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = userRes.rows[0];
    return res.json({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      shatter_count: u.shatter_count,
      avatar_url: u.avatar_url ? `/api/v1/files/${u.avatar_url}` : null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error fetching profile' });
  }
};
```

---

### ۲.۴. مسیرهای احراز هویت (`backend/src/routes/auth.routes.js`)

```javascript
import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
} from '../controllers/auth.controller.js';
import { requireAuth, verifyCsrf } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', verifyCsrf, refresh);
router.post('/logout', verifyCsrf, logout);
router.post('/logout-all', requireAuth, verifyCsrf, logoutAll);
router.get('/me', requireAuth, getMe);

export default router;
```

---

### ۲.۵. فایل اصلی برنامه و مدیریت Graceful Shutdown (`backend/src/index.js`)

```javascript
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import { checkDatabaseHealth, pool } from './config/db.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Health Check Endpoints
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (req, res) => {
  try {
    const dbStatus = await checkDatabaseHealth();
    if (dbStatus.healthy) {
      return res.status(200).json({ status: 'ready', db: 'connected', latencyMs: dbStatus.latencyMs });
    }
    return res.status(503).json({ status: 'unready', db: 'unhealthy' });
  } catch (err) {
    return res.status(503).json({ status: 'unready', error: err.message });
  }
});

// مسیرهای API v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', authRoutes); // دسترسی به /me از هر دو مسیر

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[BACKEND] Server listening on port ${PORT}`);
});

// مدیریت خاموشی تمیز (Graceful Shutdown)
const shutdown = (signal) => {
  console.log(`[BACKEND] Received ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log('[BACKEND] HTTP server closed.');
    try {
      await pool.end();
      console.log('[BACKEND] Database pool drained.');
      process.exit(0);
    } catch (err) {
      console.error('[BACKEND] Error during DB pool shutdown:', err);
      process.exit(1);
    }
  });

  // در صورت عدم اتمام تا ۱۰ ثانیه، پروسه به اجبار متوقف شود
  setTimeout(() => {
    console.error('[BACKEND] Force shutdown after timeout!');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۳
- [ ] توکن JWT دارای اعتبار ۱۵ دقیقه و الگوی اعتبارسنجی در حافظه باشد.
- [ ] کوکی Refresh Token با فلگ‌های `HttpOnly` و `SameSite=Lax` صادر شود.
- [ ] در هر رفرش، توکن قبلی باطل شده و توکن جدید صادر گردد (Rotation).
- [ ] در صورت ارسال مجدد توکن باطل‌شده فراتر از ۱۰ ثانیه، کل خانواده توکن باطل شود (Reuse Detection).
- [ ] در بازه ۱۰ ثانیه اول ابطال (Grace Period)، درخواست هم‌زمان مجاز باشد.
- [ ] مسیرهای `/health/live` و `/health/ready` بدون فاش‌سازی اطلاعات داخلی پاسخ دهند.
- [ ] سیگنال‌های `SIGTERM` و `SIGINT` باعث بستن تمیز اتصالات دیتابیس شوند.
