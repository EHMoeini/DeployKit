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
