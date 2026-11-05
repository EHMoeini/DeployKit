# Liquid Portal — Cloud-Native High-Availability Platform

یک سامانه وب مدرن ابری با معماری میکروسرویس مقیاس‌پذیر، احراز هویت توزیع‌شده بدون وضعیت (Stateless)، رابط کاربری SPA با طراحی **Spatial Liquid Glass**، مسیریابی و گواهی امنیتی خودکار Traefik v3، و استقرار خودکار با Ansible و GitHub Actions.

---

## ۱. اصول و ارکان معماری (Core Architecture Principles)
- **عدم استفاده از Redis یا Nginx:** معماری بر مبنای وب‌سرور سبک Node.js و کشینگ کارآمد استوار است و تمامی نیازهای کشینگ و مدیریت سشن‌ها به شکل بهینه و توزیع‌شده بر پایه PostgreSQL و توکن‌های بدون وضعیت مدیریت می‌شوند.
- **احراز هویت بدون وضعیت (Stateless Auth):** توکن‌های کوتاه مدت JWT در حافظه رم نگهداری شده و چرخش امن Refresh Tokenها با قفل خانواده، مهلت انقضای هم‌زمانی ۱۰ ثانیه‌ای (Grace Period) و شناسایی سوءاستفاده (Theft Detection) پیاده‌سازی شده است.
- **رابط کاربری شیشه‌ای مایع (Spatial Liquid Glass):** پالت رنگی Obsidian عمیق (`#080B12`)، تایپوگرافی اصیل فارسی وزیرمتن (Vazirmatn)، کارت‌های شیشه‌ای مات ۲۴ پیکسلی، مجسمه سه‌بعدی تعاملی با پارالکس ماوس و تفکیک قطعی شناسه پاد (Pod Identifier) در پایین صفحه.
- **توزیع ترافیک و SSL خودکار:** مسیریابی پویا با Traefik v3، پشتیبانی از چندین رپلیکای بک‌اند هم‌زمان با الگوریتم Round-Robin و مدیریت خودکار گواهی‌های Let's Encrypt.
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
│   └── docker-compose.yml   # پروکسی معکوس Traefik v3 با لودبالانسر و SSL
├── ansible/
│   ├── inventory/           # لیست سرورهای پروداکشن و متغیرها
│   ├── playbooks/           # پلی‌بوک‌های provisioning، deploy، rollback و audit
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
└── docker-compose.yml            # تمپلیت استقرار نهایی در محیط سرور
```

---

## ۳. راه‌اندازی سریع در محیط توسعه محلی

### گام ۱: ساخت شبکه و فایل‌های اولیه
```bash
./scripts/setup-traefik.sh
```

### گام ۲: اجرای سرویس‌ها با ۳ رپلیکای بک‌اند
```bash
docker compose -f docker-compose.local.yml up -d --build --scale backend=3
```

### گام ۳: اجرای آزمون‌های پذیرش سیستم
```bash
./scripts/run_acceptance_tests.sh http://localhost
```

---

## ۴. چرخه استقرار و بازگشت به عقب (Rollback) با Ansible

برای ارتقا به یک نسخه پایدار خاص:
```bash
cd ansible
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=a1b2c3d"
```

در صورت نیاز به بازگشت فوری به نسخه قبلی:
```bash
ansible-playbook -i inventory/production/hosts.yml playbooks/rollback.yml
```
