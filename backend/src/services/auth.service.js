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
