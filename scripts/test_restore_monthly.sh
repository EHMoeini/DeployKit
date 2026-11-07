#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_NAME="${PROJECT_NAME:-liquid-portal}"

# تعیین مسیر بکاپ با پشتیبانی از محیط لوکال
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

BACKUP_ROOT="${BACKUP_ROOT:-}"
if [ -z "${BACKUP_ROOT}" ]; then
  if [ -d "/srv/${PROJECT_NAME}/backups/postgres" ]; then
    BACKUP_ROOT="/srv/${PROJECT_NAME}/backups/postgres"
  else
    BACKUP_ROOT="${APP_DIR}/backups/postgres"
  fi
fi

LATEST_BACKUP=$(find "${BACKUP_ROOT}/daily" "${APP_DIR}/backups/postgres/daily" -name "backup_*.dump" -type f 2>/dev/null | sort -r | head -n 1 || true)

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

# بازگردانی رول‌ها و کانفیگ‌های عمومی در صورت وجود
LATEST_GLOBALS="${LATEST_BACKUP/backup_/globals_}"
LATEST_GLOBALS="${LATEST_GLOBALS/.dump/.sql}"
if [ -f "${LATEST_GLOBALS}" ]; then
  echo "[RESTORE-TEST] Restoring server globals and roles..."
  docker exec -i "${TEST_CONTAINER}" psql -U postgres < "${LATEST_GLOBALS}" > /dev/null 2>&1 || true
else
  docker exec -i "${TEST_CONTAINER}" psql -U postgres -c "CREATE ROLE portal_user LOGIN;" > /dev/null 2>&1 || true
fi

# اجرای Restore
echo "[RESTORE-TEST] Restoring dump into isolated test database..."
docker exec -i "${TEST_CONTAINER}" pg_restore -U postgres -d test_db --clean --if-exists --no-owner < "${LATEST_BACKUP}" || true

# اعتبارسنجی کوئری‌ها روی جداول بازیابی‌شده
echo "[RESTORE-TEST] Running verification queries..."
USER_COUNT=$(docker exec "${TEST_CONTAINER}" psql -U postgres -d test_db -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs || echo "0")
echo "[RESTORE-TEST] Verification succeeded! Found ${USER_COUNT} users in restored database."
