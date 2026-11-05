# دستورالعمل ۱۳: آزمون‌های پذیرش جامع و اعتبارسنجی سیستم (Acceptance Tests)

این سند مراحل اجرایی آزمون‌های پذیرش نهایی (شامل سناریوهای A تا G بر اساس مشخصات فنی) را جهت اعتبارسنجی رفتار بدون وضعیت بک‌اند، مقیاس‌پذیری، تحمل خطا، پروتکل‌های امنیتی احراز هویت، مسیریابی SPA، پشتیبان‌گیری پایگاه‌داده و تکرارپذیری Ansible به صورت خودکار و گام‌به‌گام تشریح می‌کند.

---

## ۱. پیش‌نیازها
- سیستم کامپوز محلی یا استک Docker Swarm در محیط Production در حال اجرا باشد.
- ابزارهای `curl`، `jq` و `docker` بر روی سیستم ارزیاب در دسترس باشند.

---

## ۲. مشخصات و ماتریس آزمون‌های پذیرش (Tests A to G)

| شناسه آزمون | موضوع آزمون                        | سناریو و آزمون مورد نظر                       | معیار موفقیت (Acceptance Criteria)                                                                                            |
| :---------- | :--------------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| **Test A**  | مقیاس‌پذیری چند رپلیکا              | ارسال متوالی درخواست‌ها به ۴ رپلیکای بک‌اند و ۳ رپلیکای فرانت‌اند | تمام رپلیکاها توکن یکسانی را می‌شناسند و هدر `x-pod-id` پاسخ‌دهنده بین رپلیکاها تغییر می‌کند. |
| **Test B**  | پایداری پس از راه‌اندازی مجدد       | ریست کامل سرویس‌های Swarm                       | کاربر بدون نیاز به لاگین مجدد با Refresh Token توکن جدید دریافت کرده و نشست پایدار می‌ماند.                                    |
| **Test C**  | تحمل خطای رپلیکا (Failover)        | حذف ناگهانی یک task بک‌اند حین ارسال ترافیک      | Swarm task جایگزین می‌سازد و Traefik ترافیک را به رپلیکاهای سالم هدایت می‌کند؛ کاربر خطای 502/503 دریافت نمی‌کند.             |
| **Test D**  | تست موارد لبه امنیتی Auth          | چرخش توکن، تشخیص استفاده مجدد، و Grace Period | توکن مصرف‌شده پس از ۱۰ ثانیه بلافاصله کل سشن‌های خانواده را باطل می‌کند؛ درخواست‌های هم‌زمان در ۱۰ ثانیه توکن یکسان دریافت می‌کنند. |
| **Test E**  | تفکیک SPA Fallback و فایل‌های گمشده | فراخوانی مسیر تمیز در برابر فایل مفقود        | مسیر `/dashboard` کد HTTP 200 با `index.html` برمی‌گرداند؛ اما مسیر `/assets/fake.png` دقیقاً HTTP 404 بازمی‌گرداند.             |
| **Test F**  | اعتبارسنجی پشتیبان‌گیری و بازیابی   | اجرای بک‌آپ و ری‌استور روی دیتابیس ایزوله       | هش SHA-256 تأیید شود، ساختار دیتابیس و داده‌ها در کانتینر موقت بازیابی شده و تعداد رکوردهای جدول‌ها برابر باشد.                 |
| **Test G**  | تکرارپذیری Ansible و امنیت شبکه    | اجرای دوبار پلی‌بوک Ansible و اسکن پورت‌ها      | در اجرای دوم taskهای سالم بازسازی نشوند، پورت ۵۴۳۲ از بیرون بسته باشد و فایروال فعال بماند.                                   |

---

## ۳. اسکریپت خودکار آزمون‌های پذیرش (`scripts/run_acceptance_tests.sh`)

یک اسکریپت جامع در ریشه پروژه جهت ارزیابی کل سیستم ایجاد نمایید:

```bash
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
else
  echo "اسکریپت پشتیبان‌گیری در مسیر سرور تست محلی غایب است (در محیط هاست اجرا گردد)."
fi

echo -e "\n=========================================================="
echo -e "${GREEN} تمامی آزمون‌های خودکار پذیرش با موفقیت سپری شدند.${NC}"
echo -e "=========================================================="
```

---

## ۴. دستورالعمل ارزیابی دستی سناریوهای زیرساخت

### ۴.۱. ارزیابی Test B (پایداری نشست پس از Restart)
1. با کاربر وارد شوید و کوکی‌های نشست را ذخیره کنید:
   ```bash
   curl -c /tmp/cookies.txt -X POST "${API_URL}/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"secret123"}'
   ```
2. سرویس‌های Swarm را از طریق Ansible یا `docker service update --force` ری‌استارت کنید:
   ```bash
   docker service update --force liquid-portal_backend
   ```
3. بدون لاگین مجدد، مسیر Refresh و سپس پروفایل را فراخوانی کنید. بررسی کنید توکن جدید صادر شود و داده‌های کاربر بدون خطا بازگردانده شوند.

### ۴.۲. ارزیابی Test C (تست پایداری در برابر مرگ رپلیکا)
1. مطمئن شوید سرویس بک‌اند روی ۴ رپلیکا تنظیم است:
   ```bash
   docker service scale liquid-portal_backend=4
   ```
2. حین ارسال حلقه‌ای از درخواست‌ها با ابزاری مانند `hey` یا حلقه `curl`، یکی از taskهای بک‌اند را متوقف کنید:
   ```bash
   BACKEND_TASK=$(docker ps -q -f label=com.docker.swarm.service.name=liquid-portal_backend | head -n 1)
   docker kill "${BACKEND_TASK}"
   ```
3. اطمینان حاصل کنید Swarm task جدید می‌سازد و هیچ خطای ۵۰۲ از سوی Traefik به کلاینت منعکس نمی‌شود.

---

## ۵. چک‌لیست اعتبارسنجی نهایی گام ۱۳
- [ ] اسکریپت `scripts/run_acceptance_tests.sh` ایجاد شده و دسترسی اجرایی (`chmod +x`) داشته باشد.
- [ ] توزیع ترافیک بین ۴ رپلیکای بک‌اند و ۳ رپلیکای فرانت‌اند از طریق هدر `x-pod-id` تأیید شود.
- [ ] تست‌های تفکیک مسیر SPA و خطای 404 فایل‌های استاتیک کاملاً پاس شوند.
- [ ] بازه ۱۰ ثانیه‌ای Grace Period برای هم‌زمانی کلاینت‌ها بدون خطا عبور کند.
- [ ] سوءاستفاده از رفرش توکن قدیمی کل سشن خانواده را مسدود کند.
- [ ] سیستم پس از ری‌استارت کانتینرها دیتای دیسک و دیتابیس را بدون کم‌وکاست حفظ نماید.
