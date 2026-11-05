# دستورالعمل ۱۰: سامانه خودکار پشتیبان‌گیری دیتابیس و سناریوهای بازیابی اضطراری (Disaster Recovery)

این سند پیاده‌سازی اسکریپت‌های پشتیبان‌گیری اتمیک، قفل هم‌زمانی با `flock`، اعتبارسنجی یکپارچگی فایل با `SHA-256` و `pg_restore`، اعمال سیاست‌های نگهداری (Retention)، تست خودکار بازیابی در محیط ایزوله و سناریوهای بازگردانی در شرایط بحرانی را مشخص می‌کند.

---

## ۱. پیش‌نیازها
- اجرای موفق مراحل `01` تا `09`.
- پایگاه داده PostgreSQL در کانتینر در حال اجرا باشد.
- پوشه اسکریپت‌ها در `scripts/` موجود باشد.

---

## ۲. گام‌های اجرایی

### ۲.۱. ساختار مسیرهای بکاپ روی Host سرور
سرویس پشتیبان‌گیری باید اطلاعات را در مسیرهای تفکیک‌شده زیر بر روی سرور نگهداری کند:

```text
/srv/<project-name>/backups/postgres/
├── daily/         # نگهداری ۷ نسخه آخر
├── weekly/        # نگهداری ۴ نسخه آخر
├── monthly/       # نگهداری ۶ نسخه آخر
└── logs/          # ثبت لاگ‌های اجرای بکاپ و تست‌های بازیابی
```

---

### ۲.۲. اسکریپت اصلی پشتیبان‌گیری خودکار (`scripts/backup_postgres.sh`)
این اسکریپت روی Host اجرا شده و بدون باز کردن پورت دیتابیس، از طریق `docker exec` داده‌ها را استخراج و اعتبارسنجی می‌کند:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME="${PROJECT_NAME:-liquid-portal}"
CONTAINER_NAME="${CONTAINER_NAME:-$(docker ps -q -f "label=com.docker.swarm.service.name=${PROJECT_NAME}_postgres" | head -n 1)}"
DB_NAME="${DB_NAME:-portal_db}"
DB_USER="${DB_USER:-portal_user}"
BACKUP_ROOT="/srv/${PROJECT_NAME}/backups/postgres"
LOG_FILE="${BACKUP_ROOT}/logs/backup.log"
LOCK_FILE="/var/lock/postgres_backup_${PROJECT_NAME}.lock"

mkdir -p "${BACKUP_ROOT}/"{daily,weekly,monthly,logs}

# اجرای لاگ‌گیری ساختاریافته
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BACKUP] $*" | tee -a "${LOG_FILE}"
}

# قفل فایل جهت جلوگیری از اجرای هم‌زمان دو پروسه بکاپ
exec 200>"${LOCK_FILE}"
flock -n 200 || { log "ERROR: Another backup process is already running. Exiting."; exit 1; }

log "Starting automated backup for database '${DB_NAME}'..."

# ۱. بررسی سلامت کانتینر دیتابیس (نام یا شناسه کانتینر Swarm)
if [ -z "${CONTAINER_NAME}" ] || [ "$(docker inspect -f '{{.State.Running}}' "${CONTAINER_NAME}" 2>/dev/null || true)" != "true" ]; then
  log "ERROR: PostgreSQL container '${CONTAINER_NAME:-not-found}' is not running! Aborting."
  exit 1
fi

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
TMP_DUMP="${BACKUP_ROOT}/daily/backup_${TIMESTAMP}.dump.tmp"
TMP_GLOBALS="${BACKUP_ROOT}/daily/globals_${TIMESTAMP}.sql.tmp"
FINAL_DUMP="${BACKUP_ROOT}/daily/backup_${TIMESTAMP}.dump"
FINAL_GLOBALS="${BACKUP_ROOT}/daily/globals_${TIMESTAMP}.sql"
CHECKSUM_FILE="${FINAL_DUMP}.sha256"

# ۲. استخراج بکاپ داده‌ها در فایل موقت
log "Dumping database content using pg_dump custom format..."
docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --format=custom --compress=9 > "${TMP_DUMP}"

log "Dumping globals (roles and server configs)..."
docker exec "${CONTAINER_NAME}" pg_dumpall -U "${DB_USER}" --globals-only > "${TMP_GLOBALS}"

# ۳. اعتبارسنجی اجباری پیش از نهایی‌سازی
log "Validating backup integrity..."
if [ ! -s "${TMP_DUMP}" ]; then
  log "ERROR: Backup file is empty! Removing temporary files."
  rm -f "${TMP_DUMP}" "${TMP_GLOBALS}"
  exit 1
fi

# بررسی ساختار با pg_restore
if ! docker run --rm -i postgres:16-alpine pg_restore --list < "${TMP_DUMP}" > /dev/null 2>&1; then
  log "ERROR: Backup file failed pg_restore list verification! Corrupt dump."
  rm -f "${TMP_DUMP}" "${TMP_GLOBALS}"
  exit 1
fi

# ۴. تولید فایل Checksum
sha256sum "${TMP_DUMP}" | awk '{print $1}' > "${CHECKSUM_FILE}"

# ۵. تبدیل فایل موقت به فایل نهایی (عملیات اتمیک)
mv "${TMP_DUMP}" "${FINAL_DUMP}"
mv "${TMP_GLOBALS}" "${FINAL_GLOBALS}"

DUMP_SIZE=$(du -h "${FINAL_DUMP}" | cut -f1)
log "SUCCESS: Backup completed. File: ${FINAL_DUMP} (Size: ${DUMP_SIZE})"

# ۶. اعمال سیاست‌های نگهداری (Retention Policy)
log "Pruning old daily backups (keeping last 7)..."
find "${BACKUP_ROOT}/daily" -name "backup_*.dump" -type f | sort -r | tail -n +8 | while read -r old_file; do
  log "Removing old daily backup: ${old_file}"
  rm -f "${old_file}" "${old_file}.sha256" "${old_file/backup_/globals_}" 2>/dev/null || true
done

log "Backup lifecycle completed cleanly."
```

---

### ۲.۳. اسکریپت اعتبارسنجی بکاپ (`scripts/verify_backup.sh`)

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <path-to-backup-file.dump>"
  exit 1
fi

CHECKSUM_FILE="${BACKUP_FILE}.sha256"

echo "[VERIFY] Checking SHA-256 for: ${BACKUP_FILE}..."
if [ -f "${CHECKSUM_FILE}" ]; then
  EXPECTED=$(cat "${CHECKSUM_FILE}")
  ACTUAL=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')
  if [ "${EXPECTED}" != "${ACTUAL}" ]; then
    echo "ERROR: Checksum mismatch! Expected ${EXPECTED}, got ${ACTUAL}"
    exit 1
  fi
  echo "SUCCESS: Checksum verified (${ACTUAL})."
else
  echo "WARNING: Checksum file not found. Skipping hash check."
fi

echo "[VERIFY] Checking archive structure with pg_restore..."
docker run --rm -i postgres:16-alpine pg_restore --list < "${BACKUP_FILE}" > /dev/null
echo "SUCCESS: Backup archive is structurally valid and readable."
```

---

### ۲.۴. تست خودکار و دوره‌ای بازیابی در محیط ایزوله (`scripts/test_restore_monthly.sh`)
این اسکریپت بدون لمس دیتابیس Production، یک کانتینر موقت ایجاد کرده و صحت بازیابی را بررسی می‌کند:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME="${PROJECT_NAME:-liquid-portal}"
BACKUP_ROOT="/srv/${PROJECT_NAME}/backups/postgres"
LATEST_BACKUP=$(find "${BACKUP_ROOT}/daily" -name "backup_*.dump" -type f | sort -r | head -n 1)

if [ -z "${LATEST_BACKUP}" ]; then
  echo "ERROR: No backup found to test!"
  exit 1
fi

TEST_CONTAINER="pg_test_restore_${RANDOM}"
echo "[RESTORE-TEST] Testing latest backup: ${LATEST_BACKUP}..."

# اجرای کانتینر موقت ایزوله
docker run -d --name "${TEST_CONTAINER}" \
  -e POSTGRES_PASSWORD=restore_test_pw \
  -e POSTGRES_DB=test_db \
  postgres:16-alpine > /dev/null

cleanup() {
  echo "[RESTORE-TEST] Cleaning up test container..."
  docker rm -f "${TEST_CONTAINER}" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# صبر برای سلامت دیتابیس موقت
echo "[RESTORE-TEST] Waiting for test postgres to be ready..."
until docker exec "${TEST_CONTAINER}" pg_isready -U postgres -d test_db > /dev/null 2>&1; do
  sleep 1
done

# اجرای Restore
echo "[RESTORE-TEST] Restoring dump into isolated test database..."
docker exec -i "${TEST_CONTAINER}" pg_restore -U postgres -d test_db --clean --if-exists < "${LATEST_BACKUP}" || true

# اعتبارسنجی کوئری‌ها روی جداول بازیابی‌شده
echo "[RESTORE-TEST] Running verification queries..."
USER_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U postgres -d test_db -t -c "SELECT COUNT(*) FROM users;" | xargs)
echo "[RESTORE-TEST] Verification succeeded! Found ${USER_COUNT} users in restored database."
```

---

### ۲.۵. سناریوهای بازیابی اضطراری (Disaster Recovery Runbooks)
- **سناریوی اول (کانتینر حذف شده اما PGDATA سالم است):** سرویس PostgreSQL را از طریق Ansible یا `docker service` مجدداً راه‌اندازی کن و هرگز بکاپ را روی داده زنده بازگردانی نکن.
- **سناریوی دوم (PGDATA خراب یا حذف شده):** ابتدا رپلیکاهای بک‌اند را از سرویس Swarm خارج کن، دایرکتوری خراب را ایزوله کن، سرویس PostgreSQL را با دایرکتوری خالی بالا بیاور، سپس globals و dump را با شناسه task دیتابیس ری‌استور کن و بک‌اند را به ۴ رپلیکا برگردان.
- در Swarm نام ثابت کانتینر وجود ندارد؛ عملیات باید از طریق Ansible یا با شناسه پویای task انجام شود.

---

## ۳. چک‌لیست اعتبارسنجی گام ۱۰
- [ ] اسکریپت `backup_postgres.sh` با موفقیت یک فایل `.dump` با فرمت custom و فایل `.sha256` بسازد.
- [ ] اجرای هم‌زمان دو اسکریپت به کمک `flock` متوقف شود.
- [ ] در صورت ایجاد فایل خالی یا خراب، فایل موقت حذف شده و بکاپ‌های قبلی پاک نشوند.
- [ ] اسکریپت `test_restore_monthly.sh` در یک کانتینر موقت اجرا شده و تعداد کاربران را بدون خطا تأیید کند.
- [ ] هر دو سناریوی بازیابی اضطراری بدون ابهام مستند شده باشند.
