# دستورالعمل‌های بازیابی اضطراری (Disaster Recovery Runbooks)

این سند مراحل اجرایی گام‌به‌گام برای مواجهه با بحران‌های دیتابیس در محیط Production را مشخص می‌کند.

---

## سناریوی اول: کانتینر دیتابیس متوقف یا حذف شده است (اما دایرکتوری `PGDATA` سالم است)

این سناریو زمانی رخ می‌دهد که کانتینر داکر به هر دلیلی Crash کرده یا حذف شده باشد، اما داده‌های دایرکتوری `/srv/${PROJECT_NAME}/postgres/data` روی سرور بدون آسیب باقی مانده باشند.

### مراحل اقدام:
1. **عدم بازگردانی بکاپ:** هرگز فایل‌های بکاپ قدیمی را روی داده‌های فعلی بازگردانی نکنید، زیرا داده‌های زنده موجود هستند.
2. **بررسی وضعیت دایرکتوری داده:**
   ```bash
   ls -la /srv/${PROJECT_NAME}/postgres/data
   ```
3. **راه‌اندازی مجدد کانتینر:**
   ```bash
   cd /srv/${PROJECT_NAME}
   docker compose up -d postgres
   ```
4. **بررسی لاگ‌های راه‌اندازی:**
   ```bash
   docker compose logs -f postgres
   ```
5. اطمینان حاصل کنید پیام `database system is ready to accept connections` در لاگ درج شده باشد.

---

## سناریوی دوم: داده‌های دایرکتوری `PGDATA` خراب یا حذف شده‌اند (Full Disaster Recovery)

این سناریو زمانی رخ می‌دهد که دیسک دچار خطا شده، داده‌ها پاک شده یا پایگاه داده دچار خطای ساختاری غیرقابل تعمیر شده است.

### مراحل اقدام:
1. **توقف کامل سرویس‌های متصل به دیتابیس:**
   برای جلوگیری از ایجاد تراکنش‌های متناقض، کانتینرهای بک‌اند را متوقف کنید:
   ```bash
   cd /srv/${PROJECT_NAME}
   docker compose stop backend
   ```

2. **ایزوله‌سازی پوشه آسیب‌دیده و آماده‌سازی مسیر جدید:**
   ```bash
   mv /srv/${PROJECT_NAME}/postgres/data /srv/${PROJECT_NAME}/postgres/data_corrupt_$(date +%s)
   mkdir -p /srv/${PROJECT_NAME}/postgres/data
   chmod 700 /srv/${PROJECT_NAME}/postgres/data
   ```

3. **راه‌اندازی کانتینر خالی PostgreSQL:**
   ```bash
   docker compose up -d postgres
   ```
   صبر کنید تا کانتینر آماده شود:
   ```bash
   until docker exec ${PROJECT_NAME}_postgres pg_isready -U ${DB_USER} -d ${DB_NAME}; do sleep 1; done
   ```

4. **اعتبارسنجی فایل بکاپ انتخابی:**
   ```bash
   LATEST_BACKUP=$(find /srv/${PROJECT_NAME}/backups/postgres/daily -name "backup_*.dump" | sort -r | head -n 1)
   /srv/${PROJECT_NAME}/scripts/verify_backup.sh "${LATEST_BACKUP}"
   ```

5. **بازیابی تعاریف سراسری و داده‌ها:**
   ```bash
   LATEST_GLOBALS="${LATEST_BACKUP/backup_/globals_}"
   LATEST_GLOBALS="${LATEST_GLOBALS%.dump}.sql"

   if [ -f "${LATEST_GLOBALS}" ]; then
     echo "Restoring global roles and settings..."
     docker exec -i ${PROJECT_NAME}_postgres psql -U ${DB_USER} -d postgres < "${LATEST_GLOBALS}"
   fi

   echo "Restoring database content..."
   docker exec -i ${PROJECT_NAME}_postgres pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists < "${LATEST_BACKUP}"
   ```

6. **راه‌اندازی مجدد سرویس Backend:**
   ```bash
   docker compose start backend
   docker compose logs -f backend
   ```

7. **تست پذیرش و سلامت سیستم:**
   ```bash
   curl -fsS https://${DOMAIN}/api/v1/health/ready
   ```
