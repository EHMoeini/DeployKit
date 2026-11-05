import { getClient, query } from '../config/db.js';

export const enqueueJob = async (queueName, payload) => {
    const res = await query(
        `INSERT INTO background_jobs (queue_name, payload, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, status, created_at`,
        [queueName, JSON.stringify(payload)]
    );
    return res.rows[0];
};

export const fetchAndLockNextJob = async (queueName, workerLeaseSeconds = 60) => {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // قفل ردیف بدون انتظار (Skip Locked) جهت جلوگیری از Race Condition بین چند Worker
        const selectRes = await client.query(
            `SELECT id, payload, attempts, max_attempts
       FROM background_jobs
       WHERE queue_name = $1
         AND (status = 'pending' OR (status = 'processing' AND locked_until < NOW()))
         AND run_at <= NOW()
       ORDER BY run_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
            [queueName]
        );

        if (selectRes.rows.length === 0) {
            await client.query('COMMIT');
            return null;
        }

        const job = selectRes.rows[0];
        await client.query(
            `UPDATE background_jobs
       SET status = 'processing',
           attempts = attempts + 1,
           locked_until = NOW() + ($1 || ' seconds')::INTERVAL,
           updated_at = NOW()
       WHERE id = $2`,
            [workerLeaseSeconds, job.id]
        );

        await client.query('COMMIT');
        return job;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

export const markJobCompleted = async (jobId) => {
    await query("UPDATE background_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1", [jobId]);
};

export const markJobFailed = async (jobId, errorMsg) => {
    await query(
        `UPDATE background_jobs
     SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
         run_at = NOW() + (POWER(2, attempts) || ' seconds')::INTERVAL, -- Exponential Backoff
         error_message = $2,
         updated_at = NOW()
     WHERE id = $1`,
        [jobId, errorMsg]
    );
};
