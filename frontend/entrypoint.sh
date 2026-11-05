#!/bin/sh
set -e

CONFIG_FILE="/app/dist/config.js"

echo "[FRONTEND-ENTRYPOINT] Generating runtime configuration..."

# تولید فایل config.js بر پایه متغیرهای محیطی کانتینر
cat <<EOF > "$CONFIG_FILE"
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL:-/api/v1}",
  PROJECT_NAME: "${PROJECT_NAME:-User Portal}"
};
EOF

echo "[FRONTEND-ENTRYPOINT] Runtime configuration successfully written to $CONFIG_FILE"

# اجرای سرور استاتیک
exec node server.js
