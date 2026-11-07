#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME="${PROJECT_NAME:-liquid-portal}"

# تشخیص خودکار کانتینر دیتابیس (سارم پروداکشن یا لوکال داکر کامپوز)
CONTAINER_NAME="${CONTAINER_NAME:-}"
if [ -z "${CONTAINER_NAME}" ]; then
  CONTAINER_NAME="$(docker ps -q -f "name=local_postgres" | head -n 1)"
  if [ -z "${CONTAINER_NAME}" ]; then
    CONTAINER_NAME="$(docker ps -q -f "label=com.docker.swarm.service.name=${PROJECT_NAME}_postgres" | head -n 1)"
  fi
  if [ -z "${CONTAINER_NAME}" ]; then
    CONTAINER_NAME="$(docker ps -q -f "name=postgres" | head -n 1)"
  fi
fi

DB_NAME="${DB_NAME:-portal_db}"
DB_USER="${DB_USER:-portal_user}"

# در صورت عدم دسترسی به /srv، مسیر لوکال در پوشه پروژه استفاده می‌شود
if [ -z "${BACKUP_ROOT:-}" ]; then
  if [ -w "/srv" ] || ([ -d "/srv/${PROJECT_NAME}" ] && [ -w "/srv/${PROJECT_NAME}" ]); then
    BACKUP_ROOT="/srv/${PROJECT_NAME}/backups/postgres"
    DEFAULT_LOCK="/var/lock/postgres_backup_${PROJECT_NAME}.lock"
  else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
    BACKUP_ROOT="${APP_DIR}/backups/postgres"
    DEFAULT_LOCK="/tmp/postgres_backup_${PROJECT_NAME}.lock"
  fi
fi

LOG_FILE="${LOG_FILE:-${BACKUP_ROOT}/logs/backup.log}"
LOCK_FILE="${LOCK_FILE:-${DEFAULT_LOCK:-/tmp/postgres_backup_${PROJECT_NAME}.lock}}"

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
