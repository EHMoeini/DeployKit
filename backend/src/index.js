import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import { checkDatabaseHealth, pool } from './config/db.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const POD_ID = process.env.POD_NAME || process.env.HOSTNAME || 'pod-local';

app.use(helmet());
app.use(express.json());
app.use(cookieParser());

// Header Middleware برای هدرهای پاد و CORS
app.use((req, res, next) => {
    res.setHeader('x-pod-id', POD_ID);
    res.setHeader('Access-Control-Expose-Headers', 'x-pod-id, x-csrf-token');
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-csrf-token, x-pod-id');
    }
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

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

// مسیرهای API v1 و سازگاری با /api
app.use('/api/v1/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1/users', authRoutes); // دسترسی به /me از auth
app.use('/api/users', authRoutes);
app.use('/api/user', authRoutes);
app.use('/api/v1/users', userRoutes); // دسترسی به /me/avatar و /me/shatter
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);
app.use('/api/v1', userRoutes);       // دسترسی مستقیم به /files/:filename و /me/shatter
app.use('/api', userRoutes);

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
