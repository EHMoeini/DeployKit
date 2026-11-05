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

-- ارجاع کلید خارجی برای آواتار کاربر
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_avatar;

ALTER TABLE users
    ADD CONSTRAINT fk_users_avatar
    FOREIGN KEY (avatar_file_id)
    REFERENCES files(id)
    ON DELETE SET NULL;
