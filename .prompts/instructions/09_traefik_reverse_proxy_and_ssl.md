# دستورالعمل ۰۹: پیکربندی پروکسی معکوس Traefik، مسیریابی و صدور خودکار گواهی SSL

این سند نحوه راه‌اندازی و مدیریت سرویس متمرکز Traefik به عنوان تنها پروکسی معکوس و دروازه ورودی عمومی، لود بالانسینگ هوشمند بین Replicaهای بک‌اند بدون Sticky Session، هدایت خودکار HTTP به HTTPS و دریافت و ذخیره امن گواهی‌های Let's Encrypt با پروتکل ACME را شرح می‌دهد.

---

## ۱. پیش‌نیازها
- اجرای موفق مراحل `01` تا `08`.
- دامنه معتبر با رکورد A متصل به IP سرور (برای صدور واقعی Let's Encrypt).
- ایجاد شبکه بیرونی داکر به نام `traefik-public`.

---

## ۲. گام‌های اجرایی

### ۲.۱. ایجاد شبکه مشترک و پوشه ماندگار گواهی‌ها روی سرور
قبل از اجرای Traefik، فایل ذخیره‌سازی گواهی‌ها (`acme.json`) باید روی Host با مجوز دسترسی کاملاً اختصاصی (`chmod 600`) ایجاد شود تا Let's Encrypt به دلایل امنیتی از کار نیفتد:

```bash
# ایجاد شبکه عمومی داکر
docker network create traefik-public || true

# ایجاد مسیر نگهداری گواهی‌ها
mkdir -p /srv/traefik/acme
touch /srv/traefik/acme/acme.json
chmod 600 /srv/traefik/acme/acme.json
```

---

### ۲.۲. استقرار مستقل سرویس Traefik روی سرور (`/srv/traefik/docker-compose.yml`)
سرویس Traefik توسط Ansible در پوشه مستقل خود روی سرور مستقر می‌شود و چرخه عمر آن از برنامه‌ها جداست:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    container_name: traefik
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
    command:
      # تنظیمات عمومی و لاگ
      - "--log.level=INFO"
      - "--accesslog=true"
      # درگاه‌های ورودی
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
      - "--entrypoints.web.http.redirections.entrypoint.permanent=true"
      - "--entrypoints.websecure.address=:443"
      - "--entrypoints.websecure.http.tls=true"
      - "--entrypoints.websecure.forwardedHeaders.trustedIPs=127.0.0.1/32,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
      # ارائه‌دهنده داکر
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=traefik-public"
      # دریافت خودکار گواهی Let's Encrypt با چالش HTTP-01
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}"
      - "--certificatesresolvers.letsencrypt.acme.storage=/acme/acme.json"
      # غیرفعال‌سازی داشبورد عمومی
      - "--api.dashboard=false"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /srv/traefik/acme/acme.json:/acme/acme.json
    networks:
      - traefik-public
```

---

### ۲.۳. ماتریس اولویت‌بندی مسیریابی (Routing Priority Matrix)
مسیریابی Traefik بر اساس برچسب‌های Docker (Labels) در فایل `docker-compose.yml` برنامه صورت می‌گیرد:

| سرویس مقصد       | قانون شرطی (Rule)                     | اولویت (Priority) | پورت داخلی کانتینر | توضیح عملکرد                                                                      |
| :--------------- | :------------------------------------ | :---------------- | :----------------- | :-------------------------------------------------------------------------------- |
| **Backend API**  | `Host(domain) && PathPrefix('/api/')` | **100 (بالاتر)**  | `3000`             | تمام درخواست‌های شروع‌شده با `/api/` به Replicaهای بک‌اند لودبالانس می‌شوند.          |
| **Frontend SPA** | `Host(domain)`                        | **10 (پایین‌تر)**  | `8080`             | تمامی مسیرهای دیگر برای سرو فایل‌های استاتیک و رندر SPA به فرانت‌اند هدایت می‌گردند. |

---

### ۲.۴. قوانین بارگذاری متوازن (Load Balancing) و ممنوعیت Sticky Session
در تنظیمات سرویس Backend:
- از تعریف برچسب `traefik.http.services.<name>.loadbalancer.sticky=true` یا تنظیم کوکی چسبنده **مطلقاً خودداری کن**.
- درخواست‌های کلاینت به صورت Round-Robin بین کانتینرهای سالم (`healthy`) بک‌اند توزیع می‌شوند.
- در صورتی که یکی از کانتینرهای بک‌اند از مدار خارج شود یا Health Check آن ناموفق باشد، Traefik در کسری از ثانیه آن را از چرخه دریافت ترافیک خارج می‌کند.

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۹
- [ ] دسترسی به پورت ۸۰ با کدهای 301 یا 308 به پورت 443 و پروتکل HTTPS منتقل شود.
- [ ] فایل `acme.json` دارای سطح دسترسی `0600` بوده و اطلاعات گواهی‌های صادرشده در آن باقی بماند.
- [ ] درخواست به آدرس `https://domain/api/v1/health/live` به بک‌اند هدایت شده و کد ۲۰۰ برگرداند.
- [ ] درخواست به آدرس `https://domain/dashboard` به فرانت‌اند هدایت شده و صفحه داشبورد را لود کند.
- [ ] توزیع درخواست‌های متوالی بین Replicaهای مختلف بدون استفاده از Sticky Session بررسی و تأیید شود.
- [ ] داشبورد Traefik بر روی پورت‌های عمومی سرور باز نباشد.
