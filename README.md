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

## ۴. چرخه استقرار، به‌روزرسانی خودکار، بازگشت به عقب و Teardown

تمام تغییرات روی سرور از طریق Ansible انجام می‌شود؛ هیچ دستور دستی روی سرور لازم نیست.
استک تولید شامل **۳ رپلیکای فرانت‌اند** و **۴ رپلیکای بک‌اند** است و هر استقرار از همان اجرای اول با
`update_config` سوئرم (`parallelism: 1`، `order: start-first`، `failure_action: rollback`) به‌صورت
**rolling update** انجام می‌شود.

```bash
cd ansible

# راه‌اندازی اولیه: Docker Swarm، شبکه‌های overlay، Traefik، استک برنامه
# و نصب تایمر به‌روزرسانی خودکار. پیش‌فرض image_tag برابر latest است.
ansible-playbook -i inventory/production/hosts.yml playbooks/site.yml

# استقرار دستی یک نسخه مشخص (تگ immutable) و توقف به‌روزرسانی خودکار همان سرویس
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml -e "image_tag=a1b2c3d"

# بازگشت فوری به نسخه قبلی؛ تا استقرار بعدی روی latest، به‌روزرسانی خودکار متوقف می‌ماند
ansible-playbook -i inventory/production/hosts.yml playbooks/rollback.yml

# حذف استک‌ها بدون حذف داده‌ها و شبکه‌ها (برای revert امن)
ansible-playbook -i inventory/production/hosts.yml playbooks/teardown.yml
```

> پیش از استقرار، مقدار `ghcr_owner` و متغیرهای حساس `db_password`، `jwt_secret`، `refresh_token_secret` و `csrf_secret` را از طریق Ansible Vault یا `-e` تأمین کنید. برای ایمیج‌های خصوصی GHCR، `ghcr_token` نیز لازم است. تعداد رپلیکاها را می‌توان با `-e "backend_replicas=4 frontend_replicas=3"` تغییر داد.

### ۴.۱. انتشار خودکار تصویر و به‌روزرسانی خودکار (Auto-Update)

پس از هر push به شاخه `main`، پایپ‌لاین GitHub Actions دو ایمیج بک‌اند و فرانت‌اند را با تگ‌های
`latest` و `<short-sha>` در GHCR منتشر می‌کند. رول `watchtower` یک عامل به‌روزرسانی سازگار با
Docker Swarm را روی **اولین سرور (نود manager)** نصب می‌کند؛ این عامل هر ۵ دقیقه یک بار:

1. تصویر `latest` سرویس‌های `backend` و `frontend` را از GHCR می‌کشد.
2. دیجست تصویر کش‌شده را با دیجست ثبت‌شده در `docker service inspect` مقایسه می‌کند.
3. اگر دیجست جدید باشد، ابتدا Migrationهای بک‌اند را با همان ایمیج جدید اجرا می‌کند.
4. سپس با `docker service update --image <image>@sha256:<digest>` به‌روزرسانی را به Swarm می‌سپارد؛
   Swarm طبق `update_config` استک، rolling update را با ترتیب `start-first` انجام می‌دهد.
5. در صورت شکست Migration یا به‌روزرسانی، سرویس بک‌اند دست‌نخورده می‌ماند و چرخه متوقف می‌شود؛
   فرانت‌اند نیز تا موفقیت بک‌اند جلو نمی‌رود.

> عامل به‌روزرسانی به‌جای کانتینر Watchtower، یک اسکریپت کوچک Swarm-native است؛ زیرا Watchtower
> اصلی فقط کانتینرهای مستقل را مدیریت می‌کند و روی سرویس‌های Swarm با reconciler تداخل می‌کند.

### ۴.۲. جلوگیری از تداخل Ansible و به‌روزرسانی خودکار

هر دو مسیر (Ansible و عامل خودکار) فقط از طریق یک قفل مشترک مجاز به تغییر سرویس‌ها هستند:

- **قفل مشترک:** `/srv/<project>/.deploy.lock`. دستورات `docker stack deploy` و اجرای Migration در
  Ansible با `flock -w 900` اجرا می‌شوند و عامل خودکار با `flock -n` وارد می‌شود؛ اگر Ansible قفل را
  در اختیار داشته باشد، چرخه فعلی را رد می‌کند و در تیک بعدی دوباره تلاش می‌کند.
- **پرچم توقف:** `/srv/<project>/.deploy-in-progress` در ابتدای رول `application` ساخته و در پایان آن
  حذف می‌شود. این پرچم فاصله میان دو قفل‌گیری جداگانه Ansible (Migration و استک) را می‌بندد. پرچم
  قدیمی‌تر از ۳۰ دقیقه (اجرای ناموفق Ansible) نادیده گرفته می‌شود.
- **عدم تکرار یک انتشار:** اگر Ansible نسخه‌ای را مستقر کند، عامل خودکار همان دیجست را می‌بیند و
  کاری انجام نمی‌دهد؛ اگر عامل خودکار اول به‌روزرسانی کند، `docker stack deploy` بعدی همان دیجست را
  resolve می‌کند و تغییری اعمال نمی‌کند. بنابراین برای هر انتشار فقط یک rolling update رخ می‌دهد.
- **تگ‌های immutable:** عامل خودکار فقط سرویسی را دنبال می‌کند که تگ آن برابر `auto_update_tag`
  (پیش‌فرض `latest`) باشد. پس از `rollback.yml` یا استقرار با `<short-sha>`، آن سرویس تا استقرار
  بعدی روی `latest` به‌روزرسانی نمی‌شود و rollback دستی به‌صورت خودکار جلو نمی‌رود.

### ۴.۳. عملیات و کنترل به‌روزرسانی خودکار

```bash
# وضعیت تایمر و آخرین اجرای عامل خودکار
systemctl status liquid-portal-watchtower.timer
systemctl status liquid-portal-watchtower.service

# مشاهده لاگ تصمیم‌های به‌روزرسانی (pull، مقایسه دیجست، Migration و update)
tail -n 100 /srv/liquid-portal/auto-update.log

# توقف موقت / فعال‌سازی مجدد به‌روزرسانی خودکار
sudo systemctl stop liquid-portal-watchtower.timer
sudo systemctl start liquid-portal-watchtower.timer

# اجرای دستی یک چرخه (برای تست)
sudo systemctl start liquid-portal-watchtower.service

# توقف عامل خودکار برای همیشه (تا اجرای بعدی Ansible)
ansible-playbook -i inventory/production/hosts.yml playbooks/deploy.yml \
  -e "image_tag=latest auto_update_enabled=false"
```

متغیرهای قابل تنظیم رول `watchtower`:

| متغیر                  | پیش‌فرض | توضیح                                                              |
| :--------------------- | :------ | :----------------------------------------------------------------- |
| `auto_update_enabled`  | `true`  | فعال/غیرفعال کردن تایمر به‌روزرسانی خودکار                          |
| `auto_update_interval` | `5min`  | بازه بررسی GHCR (هر مقدار معتبر `OnUnitActiveSec` در systemd)      |
| `auto_update_tag`      | `latest`| تگ متحرکی که عامل خودکار دنبال می‌کند؛ استقرار با SHA آن را متوقف می‌کند |
