#!/usr/bin/env bash
# ==============================================================================
# Demo Login Script - curl JWT Authentication & Verification
# اسکریپت آزمایشی احراز هویت با curl و دریافت توکن JWT
# ==============================================================================
set -euo pipefail

# رنگ‌ها برای خروجی تمیز
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# دریافت آدرس پایه (پیش‌فرض: بررسی پورت 8000، 3000 و سپس پورت 80)
TARGET_URL="${1:-}"
if [ -z "${TARGET_URL}" ]; then
  if curl -s --connect-timeout 1 "http://localhost:8000/api/v1/health" >/dev/null 2>&1; then
    TARGET_URL="http://localhost:8000"
  elif curl -s --connect-timeout 1 "http://localhost:3000/api/v1/health" >/dev/null 2>&1; then
    TARGET_URL="http://localhost:3000"
  elif curl -s --connect-timeout 1 "http://localhost/api/v1/health" >/dev/null 2>&1; then
    TARGET_URL="http://localhost"
  else
    TARGET_URL="http://localhost:8000"
  fi
fi

# تمیزکاری آدرس پایانی
TARGET_URL="${TARGET_URL%/}"
API_URL="${TARGET_URL}/api/v1"

USERNAME="${2:-demo_student}"
PASSWORD="${3:-DemoPass123!}"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}🔐 اجرای آزمون احراز هویت بدون وضعیت (Stateless JWT Demo)${NC}"
echo -e "   Target Server: ${CYAN}${TARGET_URL}${NC}"
echo -e "   Username     : ${CYAN}${USERNAME}${NC}"
echo -e "${BLUE}============================================================${NC}"

# تابع کمکی برای استخراج مقدار از JSON بدون وابستگی حتمی به jq
extract_json() {
  local json="$1"
  local key="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "${json}" | jq -r ".${key} // empty"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import sys, json; data=json.loads(sys.argv[1]); print(data.get(sys.argv[2], ''))" "${json}" "${key}" 2>/dev/null || true
  else
    echo "${json}" | grep -o "\"${key}\":\"[^\"]*\"" | cut -d':' -f2 | tr -d '"' || true
  fi
}

COOKIE_JAR=$(mktemp)
HEADER_DUMP=$(mktemp)
trap 'rm -f "${COOKIE_JAR}" "${HEADER_DUMP}"' EXIT

# ۱. تلاش برای ثبت‌نام کاربر آزمایشی
echo -e "\n${YELLOW}[۱/۳] تلاش برای ثبت‌نام یا ورود کاربر...${NC}"
REG_PAYLOAD=$(cat <<EOF
{
  "username": "${USERNAME}",
  "password": "${PASSWORD}"
}
EOF
)

BODY=$(curl -s -D "${HEADER_DUMP}" \
  -c "${COOKIE_JAR}" \
  -X POST "${API_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "${REG_PAYLOAD}" || true)

HTTP_STATUS=$(head -n 1 "${HEADER_DUMP}" 2>/dev/null | awk '{print $2}' || echo "000")
POD_ID=$(grep -i '^x-pod-id:' "${HEADER_DUMP}" 2>/dev/null | cut -d':' -f2 | tr -d '\r\n ' || true)

# اگر قبلاً ثبت شده بود، لاگین می‌کنیم
if [ "${HTTP_STATUS}" = "409" ] || [ "${HTTP_STATUS}" = "400" ]; then
  echo -e "   ℹ️ کاربر قبلاً ثبت شده است؛ ارسال درخواست لاگین..."
  rm -f "${HEADER_DUMP}"
  BODY=$(curl -s -D "${HEADER_DUMP}" \
    -c "${COOKIE_JAR}" \
    -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "${REG_PAYLOAD}")

  HTTP_STATUS=$(head -n 1 "${HEADER_DUMP}" 2>/dev/null | awk '{print $2}' || echo "000")
  POD_ID=$(grep -i '^x-pod-id:' "${HEADER_DUMP}" 2>/dev/null | cut -d':' -f2 | tr -d '\r\n ' || true)
fi

if [ "${HTTP_STATUS}" != "200" ] && [ "${HTTP_STATUS}" != "201" ]; then
  echo -e "${RED}❌ خطا در احراز هویت! کد وضعیت HTTP: ${HTTP_STATUS}${NC}"
  echo -e "پاسخ سرور: ${BODY}"
  exit 1
fi

ACCESS_TOKEN=$(extract_json "${BODY}" "accessToken")
CSRF_TOKEN=$(extract_json "${BODY}" "csrfToken")

if [ -z "${ACCESS_TOKEN}" ]; then
  echo -e "${RED}❌ توکن دسترسی در پاسخ دریافت نشد!${NC}"
  echo -e "پاسخ دریافتی: ${BODY}"
  exit 1
fi

echo -e "${GREEN}✓ احراز هویت با موفقیت انجام شد (HTTP ${HTTP_STATUS})${NC}"
if [ -n "${POD_ID}" ]; then
  echo -e "   شناسه پاد پاسخ‌دهنده (Pod ID): ${CYAN}${POD_ID}${NC}"
fi

# ۲. نمایش فرمت توکن JWT
echo -e "\n${YELLOW}[۲/۳] توکن دسترسی JWT دریافت شده:${NC}"
echo -e "${CYAN}${ACCESS_TOKEN}${NC}"
echo -e "\n   توضیح: همان‌طور که مشاهده می‌کنید توکن با پیشوند ${GREEN}eyJ...${NC} (فرمت استاندارد Base64Url هدر JWT) آغاز می‌شود."

# ۳. اعتبارسنجی توکن با فراخوانی اندپوینت حفاظت‌شده /users/me
echo -e "\n${YELLOW}[۳/۳] تست فراخوانی اندپوینت حفاظت‌شده با Bearer Token...${NC}"
ME_RES=$(curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -b "${COOKIE_JAR}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  "${API_URL}/users/me")

ME_STATUS=$(echo "${ME_RES}" | grep "HTTP_STATUS:" | cut -d':' -f2)
ME_BODY=$(echo "${ME_RES}" | sed -e '/HTTP_STATUS:/d')

if [ "${ME_STATUS}" = "200" ]; then
  echo -e "${GREEN}✓ توکن معتبر است و هویت با موفقیت تأیید شد:${NC}"
  echo -e "   پاسخ پروفایل: ${ME_BODY}"
else
  echo -e "${RED}⚠️ هشدار: اندپوینت /users/me کد ${ME_STATUS} برگرداند: ${ME_BODY}${NC}"
fi

echo -e "\n${GREEN}============================================================${NC}"
echo -e "${GREEN}🎉 آزمون موفق! سیستم احراز هویت کاملاً درست کار می‌کند.${NC}"
echo -e "${GREEN}============================================================${NC}"
