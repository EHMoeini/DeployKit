-- حذف قابلیت‌های آواتار و شمارنده رویداد از دیتابیس‌های موجود
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_avatar;

ALTER TABLE users
    DROP COLUMN IF EXISTS avatar_file_id;

ALTER TABLE users
    DROP COLUMN IF EXISTS shatter_count;
