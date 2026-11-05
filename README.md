# Liquid Portal — Cloud-Native High-Availability Platform

یک سامانه وب مدرن ابری با معماری مقیاس‌پذیر، احراز هویت توزیع‌شده بدون وضعیت (Stateless)، رابط کاربری SPA با طراحی **Spatial Liquid Glass**، مسیریابی و گواهی امنیتی خودکار Traefik v3، ارکستراسیون **Docker Swarm** و استقرار خودکار با Ansible و GitHub Actions.

---

## ۱. اصول و ارکان معماری (Core Architecture Principles)
- **عدم استفاده از Redis یا Nginx:** معماری بر مبنای وب‌سرور سبک Node.js و کشینگ کارآمد استوار است و تمامی نیازهای کشینگ و مدیریت سشن‌ها به شکل بهینه و توزیع‌شده بر پایه PostgreSQL و توکن‌های بدون وضعیت مدیریت می‌شوند.
- **احراز هویت بدون وضعیت (Stateless Auth):** توکن‌های کوتاه مدت JWT در حافظه رم نگهداری شده و چرخش امن Refresh Tokenها با قفل خانواده، مهلت انقضای هم‌زمانی ۱۰ ثانیه‌ای (Grace Period) و شناسایی سوءاستفاده (Theft Detection) پیاده‌سازی شده است.
- **رابط کاربری شیشه‌ای مایع (Spatial Liquid Glass):** پالت رنگی Obsidian عمیق (`#080B12`)، تایپوگرافی اصیل فارسی وزیرمتن (Vazirmatn)، کارت‌های شیشه‌ای مات ۲۴ پیکسلی، مجسمه سه‌بعدی تعاملی با پارالکس ماوس و تفکیک قطعی شناسه پاد (Pod Identifier) در پایین صفحه.
- **توزیع ترافیک و SSL خودکار:** مسیریابی پویا با Traefik v3 روی Docker Swarm، توزیع درخواست‌ها بین ۳ رپلیکای فرانت‌اند و ۴ رپلیکای بک‌اند با الگوریتم Round-Robin و مدیریت خودکار گواهی‌های Let's Encrypt.
- **تاب‌آوری و بازیابی فاجعه (Disaster Recovery):** اسکریپت‌های پشتیبان‌گیری اتمیک با قفل `flock`، نگهداری الگوی 7/4/6، اعتبارسنجی با هش SHA-256 و محیط شبیه‌سازی ماهانه ری‌استور.

---

## ۲. ساختار دایرکتوری‌های پروژه (`./app`)

```
app/
├── backend/
│   ├── src/
│   │   ├── config/          # تنظیمات دیتابیس و محیطی
│   │   ├── controllers/     # منطق کنترلرهای احراز هویت و کاربر
│   │   ├── middleware/      # لایه‌های اعتبارسنجی JWT، CSRF، لاگر و آپلود
│   │   ├── routes/          # تعاریف مسیرهای API
│   │   ├── services/        # منطق تجاری، توکن‌ها و سیستم فایل
│   │   └── index.js         # سرور Express، مانیتورینگ سلامت و Graceful Shutdown
│   ├── migrations/          # اسکریپت‌های SQL با پیشوند عددی
│   ├── scripts/migrate.js   # مجری مستقل مایگریشن‌های پایگاه داده
│   ├── Dockerfile           # ایمیج چندمرحله‌ای بهینه Node 20 Alpine
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # مجسمه شیشه‌ای، هدر، فوتر پاد و فیلدهای شناور
│   │   ├── pages/           # ویوی احراز هویت و داشبورد تعاملی
│   │   ├── services/        # کلاینت HTTP، مدیریت سشن و آداپتور پاد
│   │   ├── styles/          # شیوه شیشه‌ای مایع فضایی (spatial-glass.css)
│   │   └── main.js          # مسیریاب History API با محافظ‌های احراز هویت
│   ├── server.js            # وب‌سرور سبک استاتیک نود (تفکیک 404 از SPA Fallback)
│   ├── entrypoint.sh        # تزریق متغیرهای محیطی در زمان اجرا (/config.js)
│   ├── Dockerfile           # ایمیج چندمرحله‌ای سبک تحت کاربر node
│   └── package.json
├── traefik/
│   └── docker-compose.yml   # استک Swarm پروکسی معکوس Traefik v3 با لودبالانسر و SSL
├── ansible/
│   ├── inventory/           # لیست سرورهای پروداکشن و متغیرها
│   ├── playbooks/           # پلی‌بوک‌های provisioning، deploy، rollback و teardown
│   ├── roles/               # رول‌های ماژولار (common, security, firewall, docker, traefik, ...)
│   └── ansible.cfg
├── scripts/
│   ├── backup_postgres.sh        # بکاپ اتمیک پایگاه داده با چرخش روزانه
│   ├── verify_backup.sh          # اعتبارسنجی ساختار و هش SHA-256 بکاپ
│   ├── test_restore_monthly.sh   # تست دوره‌ای ری‌استور در کانتینر ایزوله
│   ├── setup-traefik.sh          # آماده‌سازی شبکه و فایل acme.json با دسترسی 600
│   └── run_acceptance_tests.sh   # آزمون‌های جامع پذیرش (A تا G)
├── docs/
│   ├── disaster_recovery.md      # راهنمای گام‌به‌گام سناریوهای بحران
│   └── runbook_and_operations.md # کتابچه دستورات و راهنمای عملیاتی
├── .github/workflows/
│   └── docker-publish.yml        # پایپ‌لاین انتشار ایمیج‌های تغییرناپذیر در GHCR
├── docker-compose.local.yml      # ارکستراسیون محیط توسعه محلی با مقیاس چندرپلیکایی
└── docker-compose.yml            # استک Docker Swarm برای استقرار Production (۳ فرانت / ۴ بک‌اند)
```

---

## ۳. راه‌اندازی سریع در محیط توسعه محلی

```bash
# اجرای سرویس‌ها با ۳ رپلیکای بک‌اند (شبکه و Traefik محلی داخل همین فایل ساخته می‌شوند)
docker compose -f docker-compose.local.yml up -d --build --scale backend=3

# اجرای آزمون‌های پذیرش؛ در محیط محلی تعداد رپلیکاها را دستی مشخص کنید
EXPECTED_BACKEND_PODS=3 EXPECTED_FRONTEND_PODS=1 \
  ./scripts/run_acceptance_tests.sh http://localhost
```

---

## ۴. چرخه استقرار، بازگشت به عقب و Teardown با Ansible

تمام تغییرات روی سرور از طریق Ansible انجام می‌شود؛ هیچ دستور دستی روی سرور لازم نیست.
استک تولید شامل **۳ رپلیکای فرانت‌اند** و **۴ رپلیکای بک‌اند** است.

```bash
cd ansible

# راه‌اندازی اولیه: Docker Swarm، شبکه‌های overlay، Traefik و استک برنامه
# برای اولین نصب می‌توانید تگ immutable را نیز مشخص کنید
ansible-playbook -i inventory/production/hosts.yml playbooks/site.yml \
  -e "image_tag=a1b2c3d"

# استقرار یک نسخه immutable مشخص
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=a1b2c3d"

# بازگشت فوری به نسخه قبلی
ansible-playbook -i inventory/production/hosts.yml playbooks/rollback.yml

# حذف استک‌ها بدون حذف داده‌ها و شبکه‌ها (برای revert امن)
ansible-playbook -i inventory/production/hosts.yml playbooks/teardown.yml
```

> پیش از استقرار، مقدار `ghcr_owner` و متغیرهای حساس `db_password`، `jwt_secret`، `refresh_token_secret` و `csrf_secret` را از طریق Ansible Vault یا `-e` تأمین کنید. برای ایمیج‌های خصوصی GHCR، `ghcr_token` نیز لازم است. تعداد رپلیکاها را می‌توان با `-e "backend_replicas=4 frontend_replicas=3"` تغییر داد.
