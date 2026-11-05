# دستورالعمل ۱۴: راهنمای عملیات، نگهداری و کتابچه مستندات سیستم (Runbook & Operations)

این سند آخرین گام از نقشه راه توسعه است و شامل راهنمای جامع عملیاتی برای محیط Production، دیکشنری کامل متغیرهای محیطی، ماتریس ظرفیت‌سنجی منابع و اتصالات، سناریوهای واکنش به حوادث (Incident Response)، و معیارهای تحویل نهایی پروژه می‌باشد.

---

## ۱. کتابچه دستورات متداول عملیاتی (Operational Runbook)

### ۱.۱. وضعیت سرویس‌ها و پایش لاگ‌ها
برای پایش یکپارچه کلیه اجزای سیستم، دستورات زیر روی هاست سرور اجرا می‌شوند:

```bash
# مشاهده سرویس‌ها و تعداد رپلیکاها
docker stack services liquid-portal

# بررسی لاگ‌های لایو Traefik با تمرکز بر درخواست‌های دارای خطا
docker service logs -f --tail=100 traefik_traefik | grep -E "4[0-9]{2}|5[0-9]{2}"

# بررسی لاگ‌های اپلیکیشن بک‌اند به صورت ساخت‌یافته
docker service logs -f --tail=100 liquid-portal_backend

# بررسی اتصالات جاری به پایگاه‌داده PostgreSQL
PG_CONTAINER=$(docker ps -q -f label=com.docker.swarm.service.name=liquid-portal_postgres | head -n 1)
docker exec -it "$PG_CONTAINER" psql -U ${DB_USER} -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

---

### ۱.۲. مقیاس‌دهی رپلیکاهای سرویس‌ها (Scaling)
مقیاس‌دهی از طریق متغیرهای Ansible انجام می‌شود و تعداد پیش‌فرض ۳ فرانت و ۴ بک‌اند است:

```bash
cd ansible
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml \
  -e "image_tag=a1b2c3d backend_replicas=4 frontend_replicas=3"
```

---

### ۱.۳. فرآیند اعمال Migration بدون اختلال در سرویس (Zero-Downtime Migration)
Migration به‌صورت خودکار توسط رول `application` و پیش از roll-out نسخه جدید اجرا می‌شود. عامل به‌روزرسانی خودکار نیز پیش از هر به‌روزرسانی بک‌اند، Migrationها را با ایمیج جدید اجرا می‌کند و در صورت شکست، کل چرخه را متوقف می‌کند. اجرای دستی لازم نیست.

---

### ۱.۴. به‌روزرسانی خودکار تصاویر (Auto-Update Runbook)

پس از هر push به `main`، GitHub Actions تگ `latest` را در GHCR به‌روزرسانی می‌کند. رول `watchtower` روی نود manager هر ۵ دقیقه یک چرخه اجرا می‌کند: pull تصویر `latest`، مقایسه دیجست با سرویس، اجرای Migration بک‌اند و سپس `docker service update`. Swarm طبق `update_config` استک، rolling update را با `start-first` و `parallelism: 1` انجام می‌دهد.

```bash
# وضعیت عامل خودکار
systemctl status liquid-portal-watchtower.timer
systemctl status liquid-portal-watchtower.service

# لاگ تصمیم‌ها و خروجی pull/update/migration
tail -f /srv/liquid-portal/auto-update.log

# اجرای دستی یک چرخه
sudo systemctl start liquid-portal-watchtower.service

# توقف موقت / فعال‌سازی
sudo systemctl stop liquid-portal-watchtower.timer
sudo systemctl start liquid-portal-watchtower.timer

# غیرفعال‌سازی پایدار از طریق Ansible
cd ansible
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml \
  -e "image_tag=latest auto_update_enabled=false"
```

| متغیر Ansible          | پیش‌فرض | توضیح                                                             |
| :--------------------- | :------ | :---------------------------------------------------------------- |
| `auto_update_enabled`  | `true`  | فعال یا غیرفعال کردن تایمر به‌روزرسانی خودکار                      |
| `auto_update_interval` | `5min`  | بازه بررسی GHCR (مقدار معتبر `OnUnitActiveSec` در systemd)        |
| `auto_update_tag`      | `latest`| تگ متحرک مورد دنبال‌شده؛ سرویس pin‌شده به SHA نادیده گرفته می‌شود   |

**عدم تداخل با Ansible:**
- قفل مشترک `/srv/<project>/.deploy.lock`: Ansible با `flock -w 900` و عامل خودکار با `flock -n`.
- پرچم `/srv/<project>/.deploy-in-progress`: در ابتدای رول `application` ساخته و در پایان حذف می‌شود؛ پرچم قدیمی‌تر از ۳۰ دقیقه نادیده گرفته می‌شود.
- چون هر دو طرف دیجست/تگ فعلی را مقایسه می‌کنند، برای هر انتشار فقط یک rolling update رخ می‌دهد.
- استقرار با `<short-sha>` سرویس را از کانال خودکار خارج می‌کند؛ برای بازگشت، دوباره با `image_tag=latest` مستقر کنید.

---

## ۲. دیکشنری جامع متغیرهای محیطی (Environment Variable Dictionary)

کلیه متغیرهای محیطی سیستم بر اساس جدول زیر دسته‌بندی و ایمن‌سازی می‌شوند:

| متغیر                   | سرویس                 | توضیحات                                          | حساسیت امنیتی           | پیش‌فرض / نمونه                             |
| :---------------------- | :-------------------- | :----------------------------------------------- | :---------------------- | :----------------------------------------- |
| `NODE_ENV`              | `backend`, `frontend` | حالت اجرای محیط برنامه‌نویسی یا عملیات            | عمومی                   | `production`                               |
| `PORT`                  | `backend`, `frontend` | پورت داخلی شنیداری وب‌سرور نود                    | عمومی                   | `3000` (Backend) / `8080` (Frontend)       |
| `DB_HOST`               | `backend`             | نام سرویس PostgreSQL در شبکه داخلی Swarm         | عمومی / کانفیگ          | `liquid-portal_postgres`                   |
| `JWT_SECRET`            | `backend`             | کلید رمزنگاری امضای توکن‌های کوتاه مدت JWT        | **بسیار حساس (Secret)** | مقدار تصادفی ۶۴ کاراکتری هگز               |
| `REFRESH_TOKEN_SECRET`  | `backend`             | کلید تولید توکن‌های رفرش                          | **بسیار حساس (Secret)** | مقدار تصادفی ۶۴ کاراکتری هگز               |
| `CSRF_SECRET`           | `backend`             | کلید تولید هش توکن‌های ضد جعل Double Submit       | **حساس (Secret)**       | رشته ۳۲ کاراکتری تصادفی                    |
| `DB_POOL_MAX`           | `backend`             | حداکثر اتصال استخر هر رپلیکا                     | عمومی / کانفیگ          | `10`                                       |
| `SHARED_STORAGE_PATH`   | `backend`             | مسیر مطلق نگهداری فایل‌های آپلود شده              | عمومی                   | `/srv/portal/uploads`                      |
| `MAX_FILE_SIZE_MB`      | `backend`             | سقف مجاز اندازه آپلود فایل به مگابایت            | عمومی                   | `5`                                        |
| `DOMAIN`                | `traefik`, `frontend` | دامنه رسمی دسترسی به سیستم                       | عمومی                   | `portal.example.com`                       |
| `ACME_EMAIL`            | `traefik`             | ایمیل تماس ثبت گواهی Let's Encrypt               | عمومی                   | `admin@example.com`                        |
| `API_BASE_URL`          | `frontend`            | آدرس پایه API برای کلاینت SPA (تزریق در runtime) | عمومی                   | `/api/v1`                                  |
| `BACKUP_RETENTION_DAYS` | `scripts`             | تعداد روزهای نگهداری بک‌آپ‌های روزانه              | عمومی                   | `7`                                        |

---

## ۳. ماتریس ظرفیت‌سنجی منابع و اتصالات (Capacity Planning)

### ۳.۱. بودجه‌بندی اتصالات پایگاه داده (Connection Pool Budgeting)
طبق فرمول استاندارد معماری:
$$\sum (R \times P) + W \le \text{max\_connections} - \text{superuser\_reserved}$$

- اگر `max_connections = 100` و `superuser_reserved = 3` باشد:
- کل ظرفیت قابل تخصیص: $100 - 3 = 97$ اتصال.
- در صورتی که سیستم با ۴ رپلیکای بک‌اند اجرا شود ($R = 4$) و یک کارگر پس‌زمینه ($W = 5$):
- حداکثر اندازه مجاز `DB_POOL_MAX` برای هر رپلیکا:
  $$P \le \frac{97 - 5}{4} = \frac{92}{4} = 23$$
- جهت حفظ حاشیه ایمنی، `DB_POOL_MAX` برابر با **۱۰** تنظیم می‌شود:
  $$(4 \times 10) + 5 = 45 \le 97$$
  این پیکربندی تضمین می‌کند سیستم با کمبود اتصال مواجه نخواهد شد.

---

### ۳.۲. برآورد فضای ذخیره‌سازی دیسک (Storage Growth Estimation)
- حجم هر بک‌آپ فشرده دیتابیس (فرمت Custom با لول zlib 9): تقریباً ۲۰٪ حجم خام دیتابیس.
- الگوی چرخش بک‌آپ (۷ روزه + ۴ هفتگی + ۶ ماهه): در مجموع **۱۷ نسخه پشتیبان**.
- پارتیشن `/srv/backups/postgres` باید حداقل **۳ برابر** حجم پیش‌بینی شده سالانه دیتابیس ظرفیت داشته باشد.

---

## ۴. کتابچه راهنمای واکنش به حوادث (Incident Response Playbooks)

### ۴.۱. سناریو ۱: خرابی کامل هاست (Total Host Disaster)
1. راه‌اندازی سرور جدید لینوکس ابری با سیستم‌عامل Ubuntu 22.04 LTS.
2. اعمال کلید SSH عمومی مدیر روی سرور جدید.
3. اجرای پلی‌بوک‌های Ansible از روی ماشین کنترل:
   ```bash
   cd ansible
   ansible-playbook -i inventory/production/hosts.yml playbooks/site.yml
   ```
4. بازیابی آخرین فایل پشتیبان پایگاه‌داده با اسکریپت `scripts/restore_postgres.sh`.
5. بازیابی آرشیو فایل‌های پوشه آپلودها در مسیر `/srv/liquid-portal/uploads/`.
6. اجرای کانتینرها و ارزیابی صحت کارکرد با اسکریپت آزمون‌های پذیرش:
   ```bash
   bash scripts/run_acceptance_tests.sh https://portal.example.com
   ```

---

### ۴.۲. سناریو ۲: رسیدن به سقف نرخ Let's Encrypt (Rate Limit) یا خطای تمدید SSL
1. بررسی لاگ Traefik:
   ```bash
   docker service logs traefik_traefik | grep acme
   ```
2. در صورتی که دامنه‌ای دچار Rate Limit شده باشد:
   - پیکربندی موقت Traefik برای استفاده از Staging CA جهت عیب‌یابی:
     `--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`
   - رفع خطای رکورد DNS یا پورت ۸۰ فایروال.
   - بازگردانی به آدرس اصلی Let's Encrypt پس از تایید صحت چالش HTTP-01.

---

### ۴.۳. سناریو ۳: افشا یا لزوم چرخش اضطراری `JWT_SECRET`
در صورت نیاز به باطل کردن اضطراری کلیه نشست‌های موجود به دلیل مسائل امنیتی:
1. مقدار جدیدی برای `JWT_SECRET` در فایل `.env` تولید کنید:
   ```bash
   openssl rand -hex 32
   ```
2. جدول `refresh_tokens` را در دیتابیس تخلیه کنید تا کلیه نشست‌های گذشته باطل شوند:
   ```sql
   TRUNCATE TABLE refresh_tokens;
   ```
3. استقرار را با Ansible مجدداً اجرا کنید تا secret جدید روی تمام رپلیکاها اعمال شود:
   ```bash
   cd ansible
   ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=a1b2c3d"
   ```
4. تمامی کاربران ملزم به ورود مجدد امن خواهند بود.

---

## ۵. چک‌لیست تحویل نهایی و تاییدیه هوش مصنوعی (Agent Handover Criteria)

قبل از اعلام اتمام موفق پروژه، اطمینان حاصل کنید که موارد زیر تماماً برآورده شده باشند:

- [ ] تمام فایل‌های آموزشی ۱۵ گانه در `./structure/instructions/` به ترتیب شماره‌گذاری از `00` تا `14` موجود باشند.
- [ ] هیچ‌گونه سرویس اضافی خارج از تعاریف مانند Nginx یا Redis به معماری اضافه نشده باشد.
- [ ] احراز هویت با ساختار JWT در حافظه و Refresh Token یک‌بارمصرف به همراه Grace Period ۱۰ ثانیه‌ای و محافظت CSRF کار کند.
- [ ] تمایز سرور استاتیک بین SPA Client Routing و خطای اکید 404 برای فایل‌های ناموجود تایید شده باشد.
- [ ] ساختار ویوها و چرخه حیات کامپوننت‌های فرانت‌اند طبق الگوهای ساختاریافته (Mount/Unmount) پیاده شده باشند.
- [ ] سازوکار پشتیبان‌گیری اتمیک با قفل `flock` و نگهداری 7/4/6 و اعتبارسنجی SHA-256 پیاده‌سازی شده باشد.
- [ ] استقرار با Ansible از سیاست‌های ضد قفل شدن SSH و ممیزی فقط‌خواندنی دیسک تبعیت نماید.
- [ ] آزمون‌های پذیرش A تا G در اسکریپت آزمون خودکار به صورت کامل موفق گزارش شوند.
- [ ] عامل به‌روزرسانی خودکار از اولین `site.yml` نصب و فعال شود و مسیر لاگ/کنترل آن مستند شده باشد.
- [ ] قفل مشترک و پرچم توقف، تداخل Ansible و به‌روزرسانی خودکار را در عمل مسدود کنند.
- [ ] رفتار Rollback با تگ `<short-sha>` و بازگشت به کانال `latest` در Runbook مستند شده باشد.
