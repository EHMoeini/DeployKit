# راهنمای جامع عملیات، نگهداری و کتابچه راهنما (Runbook & Operations)

این سند مرجع رسمی بهره‌برداری، پایش، واکنش به حوادث و نگهداری سیستم در محیط عملیاتی (Production) است.

---

## ۱. کتابچه دستورات متداول عملیاتی (Operational Runbook)

### ۱.۱. وضعیت سرویس‌ها و پایش لاگ‌ها
برای پایش یکپارچه اجزای سیستم، دستورات زیر در هاست سرور اجرا می‌شوند:

```bash
# مشاهده سرویس‌ها، تعداد رپلیکاها و وضعیت سلامت آنها
docker stack services liquid-portal

# بررسی لاگ‌های لایو Traefik با فیلتر خطاهای HTTP
docker service logs -f --tail=100 traefik_traefik | grep -E "4[0-9]{2}|5[0-9]{2}"

# بررسی لاگ‌های اپلیکیشن بک‌اند به صورت زنده
docker service logs -f --tail=100 liquid-portal_backend

# بررسی اتصالات جاری به پایگاه‌داده PostgreSQL
PG_CONTAINER=$(docker ps -q -f label=com.docker.swarm.service.name=liquid-portal_postgres | head -n 1)
docker exec -it "$PG_CONTAINER" psql -U ${DB_USER} -d ${DB_NAME} -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

---

### ۱.۲. مقیاس‌دهی رپلیکاهای سرویس‌ها (Scaling)
مقیاس‌دهی از طریق متغیرهای Ansible انجام می‌شود و Traefik به‌صورت خودکار رپلیکاهای جدید را کشف می‌کند:

```bash
cd ansible

# مقیاس‌دهی به ۴ رپلیکای بک‌اند و ۳ رپلیکای فرانت‌اند (پیش‌فرض استک)
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml \
  -e "image_tag=a1b2c3d backend_replicas=4 frontend_replicas=3"

# تغییر تعداد رپلیکاها بدون تغییر تصویر
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml \
  -e "image_tag=a1b2c3d backend_replicas=2 frontend_replicas=2"
```

---

### ۱.۳. فرآیند اعمال مایگریشن بدون اختلال (Zero-Downtime Migration)
مایگریشن به‌صورت خودکار توسط رول `application` و پیش از roll-out نسخه جدید، با همان ایمیج بک‌اند و روی شبکه داخلی Swarm اجرا می‌شود. اجرای دستی لازم نیست. عامل به‌روزرسانی خودکار نیز پیش از هر به‌روزرسانی بک‌اند، همین مایگریشن‌ها را با ایمیج جدید اجرا می‌کند و در صورت شکست، به‌روزرسانی را متوقف می‌کند.

---

### ۱.۴. به‌روزرسانی خودکار تصاویر GHCR (Auto-Update)

رول `watchtower` روی اولین سرور (نود manager) یک سرویس و تایمر systemd نصب می‌کند. این عامل هر ۵ دقیقه تگ `latest` را از GHCR می‌کشد، دیجست آن را با دیجست سرویس مقایسه می‌کند و در صورت تغییر، ابتدا مایگریشن بک‌اند و سپس `docker service update` را اجرا می‌کند. Swarm طبق `update_config`، به‌روزرسانی را با `start-first` و `parallelism: 1` انجام می‌دهد.

```bash
# وضعیت تایمر و سرویس
systemctl status liquid-portal-watchtower.timer
systemctl status liquid-portal-watchtower.service

# مشاهده لاگ کامل تصمیم‌ها و خروجی pull/update
tail -f /srv/liquid-portal/auto-update.log

# اجرای دستی یک چرخه (بدون انتظار برای تایمر)
sudo systemctl start liquid-portal-watchtower.service

# توقف و فعال‌سازی مجدد
sudo systemctl stop liquid-portal-watchtower.timer
sudo systemctl start liquid-portal-watchtower.timer
```

| متغیر Ansible          | پیش‌فرض | توضیح                                                                 |
| :--------------------- | :------ | :-------------------------------------------------------------------- |
| `auto_update_enabled`  | `true`  | فعال یا غیرفعال کردن تایمر به‌روزرسانی خودکار                          |
| `auto_update_interval` | `5min`  | بازه بررسی GHCR؛ هر مقدار معتبر برای `OnUnitActiveSec` در systemd     |
| `auto_update_tag`      | `latest`| تگ متحرک مورد دنبال‌شده؛ سرویس‌های pin‌شده به SHA نادیده گرفته می‌شوند   |

---

### ۱.۵. جلوگیری از تداخل Ansible و به‌روزرسانی خودکار

| مکانیزم | مسیر | رفتار |
| :------ | :--- | :---- |
| قفل مشترک | `/srv/liquid-portal/.deploy.lock` | Ansible با `flock -w 900` منتظر می‌ماند؛ عامل خودکار با `flock -n` در صورت اشغال، چرخه را رد می‌کند. |
| پرچم توقف | `/srv/liquid-portal/.deploy-in-progress` | در ابتدای رول `application` ساخته و در پایان حذف می‌شود؛ فاصله بین دو قفل‌گیری Ansible را می‌بندد. پرچم قدیمی‌تر از ۳۰ دقیقه نادیده گرفته می‌شود. |
| مقایسه دیجست | `docker service inspect` در برابر `docker pull` | اگر Ansible همان نسخه را مستقر کرده باشد، عامل خودکار تغییری اعمال نمی‌کند. |
| تگ immutable | `auto_update_tag` | پس از Rollback یا استقرار با `<short-sha>`، عامل خودکار آن سرویس را جلو نمی‌برد. |

پس از یک Rollback دستی، برای بازگشت به کانال به‌روزرسانی خودکار کافی است استقرار را دوباره روی `latest` اجرا کنید:

```bash
cd ansible
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=latest"
```

---

## ۲. دیکشنری جامع متغیرهای محیطی (Environment Variable Dictionary)

| متغیر                   | سرویس                 | توضیحات                                         | حساسیت                  | نمونه / مقدار پیش‌فرض                       |
| :---------------------- | :-------------------- | :---------------------------------------------- | :---------------------- | :----------------------------------------- |
| `NODE_ENV`              | `backend`, `frontend` | حالت اجرای محیط برنامه‌نویسی یا عملیات           | عمومی                   | `production`                               |
| `PORT`                  | `backend`, `frontend` | پورت داخلی شنیداری وب‌سرور                       | عمومی                   | `3000` (Backend) / `8080` (Frontend)       |
| `DB_HOST`               | `backend`             | نام سرویس PostgreSQL در شبکه داخلی Swarm         | عمومی / کانفیگ          | `liquid-portal_postgres`                   |
| `JWT_SECRET`            | `backend`             | کلید رمزنگاری امضای توکن‌های کوتاه مدت JWT       | **بسیار حساس (Secret)** | رشته تصادفی ۶۴ کاراکتری هگز                |
| `REFRESH_TOKEN_SECRET`  | `backend`             | کلید تولید توکن‌های رفرش اوپک                    | **بسیار حساس (Secret)** | رشته تصادفی ۶۴ کاراکتری هگز                |
| `CSRF_SECRET`           | `backend`             | کلید امضای مقادیر محافظت در برابر جعل CSRF      | **حساس (Secret)**       | رشته تصادفی ۳۲ کاراکتری                    |
| `DB_POOL_MAX`           | `backend`             | سقف اتصالات استخر هر رپلیکای بک‌اند              | عمومی / کانفیگ          | `10`                                       |
| `SHARED_STORAGE_PATH`   | `backend`             | مسیر نگهداری فایل‌های آپلود شده روی سرور         | عمومی                   | `/srv/portal/uploads`                      |
| `MAX_FILE_SIZE_MB`      | `backend`             | حداکثر حجم مجاز آپلود به مگابایت                | عمومی                   | `5`                                        |
| `DOMAIN`                | `traefik`, `frontend` | دامنه رسمی دسترسی به سیستم                      | عمومی                   | `portal.example.com`                       |
| `ACME_EMAIL`            | `traefik`             | ایمیل تماس جهت ثبت گواهی Let's Encrypt          | عمومی                   | `admin@example.com`                        |
| `API_BASE_URL`          | `frontend`            | آدرس پایه API برای کلاینت SPA (تزریق زمان اجرا) | عمومی                   | `/api/v1`                                  |
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
   PG_CONTAINER=$(docker ps -q -f label=com.docker.swarm.service.name=liquid-portal_postgres | head -n 1)
   docker exec -i "$PG_CONTAINER" pg_restore -U ${DB_USER} -d ${DB_NAME} --clean --if-exists < "${LATEST_BACKUP}"
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
   docker service logs traefik_traefik | grep acme
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
2. به‌روزرسانی مقدار `JWT_SECRET` در متغیرهای Ansible (Vault یا `-e`).
3. باطل‌سازی کلیه نشست‌های موجود در دیتابیس:
   ```sql
   TRUNCATE TABLE refresh_tokens;
   ```
4. اجرای مجدد استقرار با Ansible؛ تغییر secret باعث roll-out امن رپلیکاهای بک‌اند می‌شود:
   ```bash
   cd ansible
   ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=a1b2c3d"
   ```
5. تمام کاربران به شکل امن از سیستم خارج شده و ملزم به ورود مجدد خواهند بود.
