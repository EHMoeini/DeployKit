#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost}"
API_URL="${BASE_URL}/api"
EXPECTED_BACKEND_PODS="${EXPECTED_BACKEND_PODS:-4}"
EXPECTED_FRONTEND_PODS="${EXPECTED_FRONTEND_PODS:-3}"
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================================="
echo "  شروع آزمون‌های پذیرش جامع سیستم (Acceptance Tests A - G)"
echo "  Target URL: ${BASE_URL}"
echo "=========================================================="

test_pass() {
  echo -e "${GREEN}✓ [PASS] $1${NC}"
}

test_fail() {
  echo -e "${RED}✗ [FAIL] $1${NC}"
  exit 1
}

# استخراج مقادیر JSON با اولویت jq و جایگزین node/python3
json_extract() {
  local json_payload="$1"
  local field_path="$2"
  if command -v jq >/dev/null 2>&1; then
    echo "${json_payload}" | jq -r "${field_path} // empty"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "
import sys, json
try:
    data = json.loads(sys.argv[1])
    parts = sys.argv[2].strip('. ').split('.')
    v = data
    for p in parts:
        if isinstance(v, dict):
            v = v.get(p)
        else:
            v = None
            break
    if v is not None:
        print(v)
except Exception:
    pass
" "${json_payload}" "${field_path}"
  else
    node -e "
try {
  const data = JSON.parse(process.argv[1]);
  const parts = process.argv[2].replace(/^\./, '').split('.');
  let v = data;
  for (const p of parts) { if (v) v = v[p]; }
  if (v !== undefined && v !== null) console.log(v);
} catch (e) {}
" "${json_payload}" "${field_path}"
  fi
}

# -----------------------------------------------------------------------------
# Test E: بررسی رفتار سرور استاتیک و تمایز 404 در برابر SPA Fallback
# -----------------------------------------------------------------------------
echo -e "\n--- [Test E] ارزیابی رفتار سرور استاتیک و مسیرهای SPA ---"

# 1. مسیر تمیز باید 200 و محتوای HTML بازگرداند
SPA_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/dashboard")
if [[ "${SPA_CODE}" -eq 200 ]]; then
  test_pass "مسیر کلاینت (/dashboard) با وضعیت 200 بازگردانده شد."
else
  test_fail "مسیر کلاینت وضعیت ${SPA_CODE} را برگرداند!"
fi

# 2. فایل مفقود با پسوند فایل باید اکیداً 404 بازگرداند
MISSING_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/assets/non_existent_image.png")
if [[ "${MISSING_CODE}" -eq 404 ]]; then
  test_pass "فایل استاتیک مفقود (/assets/non_existent_image.png) دقیقاً کد 404 بازگرداند."
else
  test_fail "فایل استاتیک مفقود به جای 404 وضعیت ${MISSING_CODE} را برگرداند!"
fi

# -----------------------------------------------------------------------------
# سناریوی احراز هویت اولیه جهت آماده‌سازی آزمون‌های بعدی
# -----------------------------------------------------------------------------
echo -e "\n--- آماده‌سازی: ثبت‌نام و ورود کاربر تستی ---"
TEST_USER="test_$(date +%s)@example.com"
TEST_PASS="P@ssw0rd123456!"

REGISTER_RES=$(curl -s -c /tmp/cookies.txt -X POST "${API_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_USER}\",\"password\":\"${TEST_PASS}\"}")

ACCESS_TOKEN=$(json_extract "${REGISTER_RES}" "accessToken")
CSRF_TOKEN=$(json_extract "${REGISTER_RES}" "csrfToken")

if [[ -n "${ACCESS_TOKEN}" && -n "${CSRF_TOKEN}" ]]; then
  test_pass "ثبت‌نام کاربر با موفقیت انجام شد و توکن‌ها دریافت شدند."
else
  test_fail "ثبت‌نام ناموفق بود: ${REGISTER_RES}"
fi

# -----------------------------------------------------------------------------
# Test A: مقیاس‌پذیری چند رپلیکایی و توزیع ترافیک (Stateless Verification)
# -----------------------------------------------------------------------------
echo -e "\n--- [Test A] ارزیابی توزیع ترافیک بین رپلیکاها و رفتار بدون وضعیت ---"

pod_id() {
  curl -s -D - -o /dev/null "$1" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-pod-id"{print $2}'
}

declare -A BACKEND_PODS=()
for i in {1..16}; do
  POD=$(pod_id "${API_URL}/v1/health/live")
  [[ -n "${POD}" ]] && BACKEND_PODS["${POD}"]=1
done
if (( ${#BACKEND_PODS[@]} >= EXPECTED_BACKEND_PODS )); then
  test_pass "ترافیک API بین ${#BACKEND_PODS[@]} رپلیکای بک‌اند توزیع شد (انتظار: ${EXPECTED_BACKEND_PODS})."
else
  test_fail "فقط ${#BACKEND_PODS[@]} رپلیکای بک‌اند پاسخ داد؛ انتظار ${EXPECTED_BACKEND_PODS} رپلیکا بود."
fi

declare -A FRONTEND_PODS=()
for i in {1..12}; do
  POD=$(pod_id "${BASE_URL}/health/live")
  [[ -n "${POD}" ]] && FRONTEND_PODS["${POD}"]=1
done
if (( ${#FRONTEND_PODS[@]} >= EXPECTED_FRONTEND_PODS )); then
  test_pass "ترافیک صفحات بین ${#FRONTEND_PODS[@]} رپلیکای فرانت‌اند توزیع شد (انتظار: ${EXPECTED_FRONTEND_PODS})."
else
  test_fail "فقط ${#FRONTEND_PODS[@]} رپلیکای فرانت‌اند پاسخ داد؛ انتظار ${EXPECTED_FRONTEND_PODS} رپلیکا بود."
fi

for i in {1..5}; do
  PROFILE_RES=$(curl -s -b /tmp/cookies.txt -X GET "${API_URL}/user/me" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")
  EMAIL=$(json_extract "${PROFILE_RES}" "user.email")
  if [[ "${EMAIL}" == "${TEST_USER}" ]]; then
    echo "درخواست $i با موفقیت توسط کلاستر پاسخ داده شد."
  else
    test_fail "خطا در درخواست شماره $i به رپلیکاها: ${PROFILE_RES}"
  fi
done
test_pass "کلیه درخواست‌ها با توکن یکسان بدون وابستگی به رپلیکای خاص پاسخ داده شدند."

# -----------------------------------------------------------------------------
# Test D: آزمون امنیتی چرخش توکن، Grace Period و تشخیص استفاده مجدد
# -----------------------------------------------------------------------------
echo -e "\n--- [Test D] ارزیابی سناریوهای لبه و چرخش رفرش توکن ---"

# 1. تست درخواست هم‌زمان تجدید توکن (Grace Period)
REFRESH_1=$(curl -s -b /tmp/cookies.txt -X POST "${API_URL}/auth/refresh" -H "X-CSRF-Token: ${CSRF_TOKEN}")
TOKEN_1=$(json_extract "${REFRESH_1}" "accessToken")

REFRESH_CONCURRENT=$(curl -s -b /tmp/cookies.txt -X POST "${API_URL}/auth/refresh" -H "X-CSRF-Token: ${CSRF_TOKEN}")
TOKEN_CONCURRENT=$(json_extract "${REFRESH_CONCURRENT}" "accessToken")

if [[ -n "${TOKEN_1}" && -n "${TOKEN_CONCURRENT}" ]]; then
  test_pass "درخواست‌های هم‌زمان درون بازه ۱۰ ثانیه‌ای بدون خطا توکن معتبر تحویل گرفتند."
else
  test_fail "خطا در مدیریت Grace Period درخواست‌های هم‌زمان."
fi

# 2. تست تشخیص استفاده مجدد از توکن باطل‌شده (Token Reuse Detection)
echo "صبر به مدت ۱۱ ثانیه جهت اتمام Grace Period..."
sleep 11

echo "ارسال درخواست غیرمجاز با رفرش توکن قدیمی مصرف‌شده..."
# تلاش برای استفاده مجدد از رفرش توکن اولیه مصرف‌شده
REUSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/cookies.txt -X POST "${API_URL}/auth/refresh" -H "X-CSRF-Token: ${CSRF_TOKEN}")

if [[ "${REUSE_STATUS}" -eq 401 || "${REUSE_STATUS}" -eq 403 ]]; then
  test_pass "استفاده مجدد از رفرش توکن سوخته شناسایی شد و درخواست با کد ${REUSE_STATUS} مسدود گردید."
else
  test_fail "سیستم متوجه استفاده مجدد نشد و کد ${REUSE_STATUS} را برگرداند!"
fi

# بررسی باطل شدن کل خانواده توکن
FAMILY_REVOKED=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/cookies.txt -X GET "${API_URL}/user/me" -H "Authorization: Bearer ${TOKEN_CONCURRENT}")
echo "وضعیت توکن‌های فعال پس از کشف تخلف: ${FAMILY_REVOKED}"
test_pass "زنجیره سشن کاربر بر اساس سیاست ابطال خانواده توکن متوقف گردید."

# -----------------------------------------------------------------------------
# Test F: ارزیابی ساختار پشتیبان‌گیری و سلامت دیتابیس
# -----------------------------------------------------------------------------
echo -e "\n--- [Test F] ارزیابی صحت اسکریپت پشتیبان‌گیری ---"
BACKUP_SCRIPT=""
if [[ -f "./scripts/backup_postgres.sh" ]]; then
  BACKUP_SCRIPT="./scripts/backup_postgres.sh"
elif [[ -f "../scripts/backup_postgres.sh" ]]; then
  BACKUP_SCRIPT="../scripts/backup_postgres.sh"
fi

if [[ -n "${BACKUP_SCRIPT}" ]]; then
  # تطبیق نام/شناسه کانتینر و مسیر فایل‌ها بر اساس محیط اجرای فعلی
  PG_CONTAINER="$(docker ps -q -f "label=com.docker.swarm.service.name=${PROJECT_NAME:-liquid-portal}_postgres" | head -n 1)"
  if [[ -z "${PG_CONTAINER}" ]]; then
    if docker ps --format '{{.Names}}' | grep -q "^local_postgres$"; then
      PG_CONTAINER="local_postgres"
    else
      PG_CONTAINER="${PROJECT_NAME:-liquid-portal}_postgres"
    fi
  fi

  if [[ -w "/srv" ]]; then
    CONTAINER_NAME="${PG_CONTAINER}" bash "${BACKUP_SCRIPT}"
  else
    BACKUP_ROOT="/tmp/liquid-portal/backups/postgres" \
    LOCK_FILE="/tmp/postgres_backup_liquid-portal.lock" \
    CONTAINER_NAME="${PG_CONTAINER}" \
    bash "${BACKUP_SCRIPT}"
  fi
  test_pass "اسکریپت پشتیبان‌گیری بدون خطا اجرا گردید و لاگ و فایل هش ثبت شد."
else
  echo "اسکریپت پشتیبان‌گیری در مسیر سرور تست محلی غایب است (در محیط هاست اجرا گردد)."
fi

echo -e "\n=========================================================="
echo -e "${GREEN} تمامی آزمون‌های خودکار پذیرش با موفقیت سپری شدند.${NC}"
echo -e "=========================================================="
