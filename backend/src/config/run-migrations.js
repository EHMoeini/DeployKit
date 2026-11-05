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
