# راهنمای جامع عملیات، نگهداری و کتابچه راهنما (Runbook & Operations)

این سند مرجع رسمی بهره‌برداری، پایش، واکنش به حوادث و نگهداری سیستم در محیط عملیاتی (Production) است.

---

## ۱. کتابچه دستورات متداول عملیاتی (Operational Runbook)

### ۱.۱. وضعیت سرویس‌ها و پایش لاگ‌ها
برای پایش یکپارچه اجزای سیستم، دستورات زیر در هاست سرور اجرا می‌شوند:

```bash
# مشاهده وضعیت تمامی کانتینرها و سلامت Healthcheck آنها
docker compose ps

# بررسی لاگ‌های لایو Traefik با فیلتر خطاهای HTTP
docker compose logs -f --tail=100 traefik | grep -E "4[0-9]{2}|5[0-9]{2}"

# بررسی لاگ‌های اپلیکیشن بک‌اند به صورت زنده
docker compose logs -f --tail=100 backend

# بررسی اتصالات جاری به پایگاه‌داده PostgreSQL
docker exec -it postgres psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

---

### ۱.۲. مقیاس‌دهی رپلیکاهای بک‌اند (Scaling)
به دلیل معماری بدون وضعیت (Stateless) و تزریق `x-pod-id` در پاسخ‌ها، مقیاس‌دهی بدون نیاز به تغییر در پیکربندی پروکسی به سادگی انجام می‌شود:

```bash
# مقیاس‌دهی به ۴ رپلیکا در حالت Production
docker compose up -d --scale backend=4 --no-recreate

# بازگشت به ۲ رپلیکا
docker compose up -d --scale backend=2 --no-recreate
```

---

### ۱.۳. فرآیند اعمال مایگریشن بدون اختلال (Zero-Downtime Migration)
کانتینر `migrate` به صورت One-off پیاده‌سازی شده و قبل از راه‌اندازی نسخه‌های جدید اجرا می‌گردد:

```bash
# اجرای ایزوله اسکریپت مایگریشن با همان ایمیج بک‌اند
docker compose run --rm migrate
```

---

## ۲. دیکشنری جامع متغیرهای محیطی (Environment Variable Dictionary)

| متغیر                   | سرویس                 | توضیحات                                         | حساسیت                  | نمونه / مقدار پیش‌فرض                       |
| :---------------------- | :-------------------- | :---------------------------------------------- | :---------------------- | :----------------------------------------- |
| `NODE_ENV`              | `backend`, `frontend` | حالت اجرای محیط برنامه‌نویسی یا عملیات           | عمومی                   | `production`                               |
| `PORT`                  | `backend`, `frontend` | پورت داخلی شنیداری وب‌سرور                       | عمومی                   | `3000` (Backend) / `8080` (Frontend)       |
| `DATABASE_URL`          | `backend`             | رشته اتصال PostgreSQL با استخر اتصالات          | **بسیار حساس (Secret)** | `postgresql://user:pass@postgres:5432/app` |
| `JWT_SECRET`            | `backend`             | کلید رمزنگاری امضای توکن‌های کوتاه مدت JWT       | **بسیار حساس (Secret)** | رشته تصادفی ۶۴ کاراکتری هگز                |
| `REFRESH_TOKEN_SECRET`  | `backend`             | کلید تولید توکن‌های رفرش اوپک                    | **بسیار حساس (Secret)** | رشته تصادفی ۶۴ کاراکتری هگز                |
| `CSRF_SECRET`           | `backend`             | کلید امضای مقادیر محافظت در برابر جعل CSRF      | **حساس (Secret)**       | رشته تصادفی ۳۲ کاراکتری                    |
| `DB_POOL_MAX`           | `backend`             | سقف اتصالات استخر هر رپلیکای بک‌اند              | عمومی / کانفیگ          | `10`                                       |
| `UPLOAD_DIR`            | `backend`             | مسیر نگهداری فایل‌های آپلود شده روی سرور         | عمومی                   | `/app/uploads`                             |
| `MAX_FILE_SIZE_BYTES`   | `backend`             | حداکثر حجم مجاز آپلود به بایت                   | عمومی                   | `5242880` (5MB)                            |
| `DOMAIN`                | `traefik`, `frontend` | دامنه رسمی دسترسی به سیستم                      | عمومی                   | `portal.example.com`                       |
| `ACME_EMAIL`            | `traefik`             | ایمیل تماس جهت ثبت گواهی Let's Encrypt          | عمومی                   | `admin@example.com`                        |
| `VITE_API_URL`          | `frontend`            | آدرس پایه API برای کلاینت SPA (تزریق زمان اجرا) | عمومی                   | `/api`                                     |
| `BACKUP_RETENTION_DAYS` | `scripts`             | تعداد روزهای نگهداری بک‌آپ‌های روزانه             | عمومی                   | `7`                                        |

---

## ۳. ماتریس ظرفیت‌سنجی منابع و اتصالات (Capacity Planning)

### ۳.۱. بودجه‌بندی اتصالات دیتابیس (Connection Pool Budgeting)
فرمول استاندارد معماری سیستم:
$$\sum (R \times P) + W \le \text{max\_connections} - \text{superuser\_reserved}$$

- به ازای `max_connections = 100` و `superuser_reserved = 3`:
- سقف قابل تخصیص: $100 - 3 = 97$ اتصال.
- در صورتی که سیستم با ۴ رپلیکای بک‌اند اجرا شود ($R = 4$) و یک سرویس کارگر پس‌زمینه ($W = 5$):
- حداکثر مجاز `DB_POOL_MAX` برای هر کانتینر:
  $$P \le \frac{97 - 5}{4} = \frac{92}{4} = 23$$
- جهت حفظ حاشیه ایمنی بالا، `DB_POOL_MAX` برابر با **۱۰** تنظیم شده است:
  $$(4 \times 10) + 5 = 45 \le 97$$
این پیکربندی مانع از بروز خطای `remaining connection slots are reserved for non-replication superuser connections` در ترافیک‌های بالا می‌شود.

---

### ۳.۲. برآورد فضای ذخیره‌سازی دیسک (Storage Growth Estimation)
- حجم هر بک‌آپ فشرده دیتابیس (فرمت Custom با لول فشرده‌سازی ۹ در zlib): حدود ۲۰٪ اندازه پایگاه‌داده خام.
- الگوی چرخش بک‌آپ (۷ نسخه روزانه + ۴ نسخه هفتگی + ۶ نسخه ماهانه): مجموعاً **۱۷ نسخه پشتیبان**.
- دایرکتوری `/srv/liquid-portal/backups/postgres` باید حداقل **۳ برابر** حجم پیش‌بینی شده سالانه دیتابیس ظرفیت داشته باشد.

---

## ۴. کتابچه راهنمای واکنش به حوادث (Incident Response Playbooks)

### ۴.۱. سناریو ۱: خرابی کامل هاست سرور (Total Host Disaster)
1. راه‌اندازی سرور جدید Ubuntu 22.04 LTS.
2. اعمال کلید SSH مدیر روی سرور جدید.
3. اجرای پلی‌بوک پایه‌ای Ansible:
   ```bash
   cd ansible
   ansible-playbook -i inventory/production/hosts.yml playbooks/site.yml
   ```
4. بازیابی آخرین بک‌آپ تایید شده با اسکریپت بازیابی:
   ```bash
   LATEST_BACKUP=$(find /srv/liquid-portal/backups/postgres/daily -name "backup_*.dump" | sort -r | head -n 1)
   /srv/liquid-portal/scripts/verify_backup.sh "${LATEST_BACKUP}"
   docker exec -i liquid-portal_postgres pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists < "${LATEST_BACKUP}"
   ```
5. بازیابی محتویات دایرکتوری `/srv/liquid-portal/uploads/`.
6. اعتبارسنجی سیستم با اسکریپت آزمون‌های پذیرش:
   ```bash
   bash scripts/run_acceptance_tests.sh https://portal.example.com
   ```

---

### ۴.۲. سناریو ۲: رسیدن به سقف نرخ Let's Encrypt (Rate Limit) یا اختلال تمدید SSL
1. بررسی لاگ Traefik:
   ```bash
   docker logs traefik | grep acme
   ```
2. در صورتی که دامنه‌ای دچار سقف نرخ موقت شده باشد:
   - فعال‌سازی سرور Staging جهت خطایابی:
     `--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`
   - بررسی و رفع خطای رکورد DNS یا پورت ۸۰ فایروال.
   - بازگردانی به آدرس اصلی Let's Encrypt پس از تایید چالش HTTP-01.

---

### ۴.۳. سناریو ۳: افشا یا چرخش اضطراری `JWT_SECRET`
1. تولید کلید امنیتی جدید:
   ```bash
   openssl rand -hex 32
   ```
2. به‌روزرسانی مقدار `JWT_SECRET` در فایل `.env`.
3. باطل‌سازی کلیه نشست‌های موجود در دیتابیس:
   ```sql
   TRUNCATE TABLE refresh_tokens;
   ```
4. ری‌استارت فوری کانتینرهای بک‌اند:
   ```bash
   docker compose restart backend
   ```
5. تمام کاربران به شکل امن از سیستم خارج شده و ملزم به ورود مجدد خواهند بود.
