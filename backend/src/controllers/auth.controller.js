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
const getPodId = () => process.env.POD_NAME || process.env.HOSTNAME || 'pod-local';

const setAuthCookies = (res, rawRefreshToken, expiresAt) => {
    res.cookie('refresh_token', rawRefreshToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
    });

    const csrfToken = generateCsrfToken();
    res.cookie('csrf_token', csrfToken, {
        httpOnly: false, // قابل خواندن توسط کلاینت جاوااسکریپت برای درج در هدر
        secure: isProd,
        sameSite: 'lax',
        path: '/',
    });
    return csrfToken;
};

const clearAuthCookies = (res) => {
    res.clearCookie('refresh_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
};

export const register = async (req, res) => {
    try {
        const rawUsername = req.body.username || req.body.email;
        const password = req.body.password;
        const display_name = req.body.display_name || req.body.displayName || req.body.username || rawUsername;
        const email = req.body.email || (rawUsername ? (rawUsername.includes('@') ? rawUsername : `${rawUsername}@app.local`) : null);

        if (!rawUsername || !password) {
            return res.status(400).json({ error: 'Username/Email and password are required' });
        }

        const checkUser = await query('SELECT id FROM users WHERE email = $1 OR display_name = $2', [email, display_name]);
        if (checkUser.rows.length > 0) {
            return res.status(409).json({ error: 'نام کاربری قبلاً ثبت شده است (Username already registered)' });
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
        const podId = getPodId();

        const csrfToken = setAuthCookies(res, rawToken, expiresAt);
        return res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                username: user.display_name || user.email.replace(/@app\.local$/, ''),
                display_name: user.display_name,
                shatter_count: user.shatter_count,
            },
            accessToken,
            csrfToken,
            podId,
        });
    } catch (err) {
        console.error('[AUTH] Register error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req, res) => {
    try {
        const rawCredential = req.body.username || req.body.email;
        const password = req.body.password;
        if (!rawCredential || !password) {
            return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است (Username and password required)' });
        }

        const syntheticEmail = rawCredential.includes('@') ? rawCredential : `${rawCredential}@app.local`;
        const userRes = await query(
            'SELECT id, email, display_name, password_hash, shatter_count FROM users WHERE email = $1 OR display_name = $2 OR email = $3',
            [rawCredential, rawCredential, syntheticEmail]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است (Invalid username or password)' });
        }

        const user = userRes.rows[0];
        const match = await comparePassword(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است (Invalid username or password)' });
        }

        const accessToken = generateAccessToken(user);
        const { rawToken, expiresAt } = await createRefreshToken(user.id);
        const podId = getPodId();

        const csrfToken = setAuthCookies(res, rawToken, expiresAt);
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.display_name || user.email.replace(/@app\.local$/, ''),
                display_name: user.display_name,
                shatter_count: user.shatter_count,
            },
            accessToken,
            csrfToken,
            podId,
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
        const podId = getPodId();

        const csrfToken = setAuthCookies(res, newRawToken, expiresAt);
        return res.json({
            user: {
                id: user.id,
                email: user.email,
                username: user.display_name || user.email.replace(/@app\.local$/, ''),
                display_name: user.display_name,
            },
            accessToken,
            csrfToken,
            podId,
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
        const podId = getPodId();
        const userData = {
            id: u.id,
            email: u.email,
            username: u.display_name || u.email.replace(/@app\.local$/, ''),
            display_name: u.display_name,
            shatter_count: u.shatter_count,
            avatar_url: u.avatar_url ? `/api/v1/files/${u.avatar_url}` : null,
        };
        return res.json({
            ...userData,
            user: userData,
            podId,
        });
    } catch (err) {
        return res.status(500).json({ error: 'Error fetching profile' });
    }
};
