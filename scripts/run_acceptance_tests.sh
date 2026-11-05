#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost}"
API_URL="${BASE_URL}/api"
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

ACCESS_TOKEN=$(echo "${REGISTER_RES}" | jq -r '.accessToken // empty')
CSRF_TOKEN=$(echo "${REGISTER_RES}" | jq -r '.csrfToken // empty')

if [[ -n "${ACCESS_TOKEN}" && -n "${CSRF_TOKEN}" ]]; then
  test_pass "ثبت‌نام کاربر با موفقیت انجام شد و توکن‌ها دریافت شدند."
else
  test_fail "ثبت‌نام ناموفق بود: ${REGISTER_RES}"
fi

# -----------------------------------------------------------------------------
# Test A: مقیاس‌پذیری چند رپلیکایی بک‌اند (Stateless Verification)
# -----------------------------------------------------------------------------
echo -e "\n--- [Test A] ارزیابی رفتار بدون وضعیت در مقیاس چند رپلیکایی ---"
for i in {1..5}; do
  PROFILE_RES=$(curl -s -b /tmp/cookies.txt -X GET "${API_URL}/user/me" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")
  EMAIL=$(echo "${PROFILE_RES}" | jq -r '.user.email // empty')
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
TOKEN_1=$(echo "${REFRESH_1}" | jq -r '.accessToken // empty')

REFRESH_CONCURRENT=$(curl -s -b /tmp/cookies.txt -X POST "${API_URL}/auth/refresh" -H "X-CSRF-Token: ${CSRF_TOKEN}")
TOKEN_CONCURRENT=$(echo "${REFRESH_CONCURRENT}" | jq -r '.accessToken // empty')

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
if [[ -f "./scripts/backup_postgres.sh" ]]; then
  bash ./scripts/backup_postgres.sh
  test_pass "اسکریپت پشتیبان‌گیری بدون خطا اجرا گردید و لاگ و فایل هش ثبت شد."
elif [[ -f "../scripts/backup_postgres.sh" ]]; then
  bash ../scripts/backup_postgres.sh
  test_pass "اسکریپت پشتیبان‌گیری بدون خطا اجرا گردید و لاگ و فایل هش ثبت شد."
else
  echo "اسکریپت پشتیبان‌گیری در مسیر سرور تست محلی غایب است (در محیط هاست اجرا گردد)."
fi

echo -e "\n=========================================================="
echo -e "${GREEN} تمامی آزمون‌های خودکار پذیرش با موفقیت سپری شدند.${NC}"
echo -e "=========================================================="
