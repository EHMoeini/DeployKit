#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_FILE="${1:-}"

# اگر فایل مشخص نشده بود، آخرین فایل بکاپ روزانه را پیدا می‌کنیم
if [ -z "${BACKUP_FILE}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  BACKUP_FILE="$(find "${APP_DIR}/backups/postgres" /srv/*/backups/postgres -type f -name "backup_*.dump" 2>/dev/null | sort -r | head -n 1 || true)"
fi

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <path-to-backup-file.dump>"
  echo "Or create a backup first using: bash scripts/backup_postgres.sh"
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
