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
