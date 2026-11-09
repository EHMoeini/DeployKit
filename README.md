# DeployKit

جعبه‌ابزار متن‌باز آماده‌سازی سرور و زیرساخت میزبانی کانتینری مبتنی بر Docker Compose و Ansible.

---

## ۱. DeployKit چیست؟

**DeployKit** یک مخزن ابزارمحور (Toolkit) است که به توسعه‌دهندگان و مدیران سیستم کمک می‌کند یک سرور لینوکسی خام (Ubuntu/Debian یا RHEL/Amazon Linux) را با حداقل مراحل و به‌صورت استاندارد، امن و خودکار آماده کرده و سرویس‌های زیرساختی پایه (شامل Docker، Docker Compose و Traefik Reverse Proxy با گواهی SSL خودکار Let's Encrypt) را مستقر کنند.

DeployKit یک وب‌اپلیکیشن، سرویس SaaS، پنل مدیریتی، یا دیتابیس اختصاصی نیست و هیچ بار اضافی روی سرور کاربر تحمیل نمی‌کند.

---

## ۲. DeployKit چه کاری انجام می‌دهد و چه کاری انجام نمی‌دهد؟

### چه کارهایی انجام می‌دهد:
- **نصب خودکار پیش‌نیازها و پایتون:** آماده‌سازی اولیه سرور خام حتی در صورت عدم نصب اولیه پایتون.
- **سخت‌سازی امنیتی پایه:** تنظیم سیاست‌های امنیتی SSH و سرویس Fail2ban.
- **فایروال هوشمند (UFW):** بستن تمام پورت‌های ورودی به جز پورت پیکربندی‌شده SSH و پورت‌های وب (80 و 443) بدون خطر قفل شدن دسترسی (Anti-Lockout).
- **نصب رسمی Docker و Docker Compose Plugin:** راه‌اندازی آخرین نسخه رسمی Docker Engine و افزونه رسمی Compose همراه با چرخش خودکار لاگ‌ها (Log Rotation).
- **راه‌اندازی Traefik v3:** استقرار پروکسی معکوس Traefik با استفاده از Docker Compose برای مسیریابی خودکار ترافیک وب، دریافت گواهی رایگان Let's Encrypt و هدایت خودکار HTTP به HTTPS.
- **ایجاد شبکه مشترک (Docker Network):** ساخت شبکه اشتراکی ایزوله (`traefik-public`) برای اتصال امن کانتینرهای آینده به Traefik بدون نیاز به باز کردن پورت‌ها روی Host.

### چه کارهایی انجام نمی‌دهد:
- استقرار خودکار اپلیکیشن دلخواه شما در این نسخه اولیه پیاده‌سازی نشده است.
- سیستم‌های اختصاصی Backup، Restore، Monitoring یا Alerting راه‌اندازی نمی‌کند.
- پایگاه‌داده اختصاصی نصب نمی‌کند.
- از Docker Swarm یا Kubernetes در مسیر اصلی استفاده نمی‌کند.

---

## ۳. پیش‌نیازهای سیستم توسعه‌دهنده (کلاینت)

روی سیستمی که دستورات را اجرا می‌کنید (لوکال یا کنترل‌کننده):
- سیستم‌عامل لینوکس یا macOS یا WSL2 در ویندوز.
- پایتون نسخه 3.10 یا بالاتر.
- نصب `ansible-core` (نسخه ۲.۱۵ یا بالاتر):
  ```bash
  pip install ansible-core
  ```
- نصب کالکشن‌های مورد نیاز Ansible:
  ```bash
  ansible-galaxy collection install community.general community.docker ansible.posix
  ```
- کلید SSH خصوصی جهت اتصال به سرور مقصد.

---

## ۴. پیش‌نیازهای سرور مقصد (Host)

- یک سرور مجازی یا اختصاصی خام (VPS / Cloud Instance) با توزیع‌های:
  - Ubuntu 22.04 / 24.04 LTS
  - Debian 11 / 12
  - Amazon Linux 2023 / RHEL 9 / Rocky Linux 9
- پورت SSH باز و دسترسی با کاربر دارای مجوز `sudo` یا `root`.
- یک IP استاتیک عمومی (Public IP).
- در صورت تمایل به صدور خودکار SSL معتبر: اشاره یک دامنه یا زیردامنه به IP سرور (یا استفاده از سرویس‌های Wildcard DNS مانند nip.io).

---

## ۵. Clone کردن Repository

```bash
git clone https://github.com/ehmoeini/DeployKit.git
cd DeployKit
```

---

## ۶. تنظیم Inventory نمونه

یک کپی از فایل نمونه بردارید:

```bash
cd ansible
cp inventory/example/hosts.yml.example inventory/hosts.yml
```

فایل `inventory/hosts.yml` را ویرایش کرده و مشخصات سرور خود را وارد کنید:

```yaml
all:
  children:
    servers:
      hosts:
        my-server:
          ansible_host: 203.0.113.10          # آی‌پی سرور شما
          ansible_user: ubuntu                 # نام کاربر SSH سرور
          ansible_port: 22                     # پورت SSH
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519 # مسیر کلید خصوصی

  vars:
    # ایمیل برای دریافت اطلاعیه‌های انقضای گواهی Let's Encrypt
    acme_email: "admin@yourdomain.com"
```

> **نکته امنیتی:** مسیر `ansible/inventory/**/hosts.yml` در `.gitignore` قرار دارد و این فایل به گیت اضافه نخواهد شد.

---

## ۷. آماده‌سازی سرور با Ansible

برای اجرای پلی‌بوک و آماده‌سازی کامل سرور، دستور زیر را اجرا کنید:

```bash
ansible-playbook -i inventory/hosts.yml playbooks/site.yml
```

این پلی‌بوک به ترتیب مراحل زیر را انجام می‌دهد:
1. `common`: به‌روزرسانی پکیج‌ها و ایجاد کاربر با دسترسی sudo.
2. `security`: سخت‌سازی پیکربندی SSH و فعال‌سازی Fail2ban.
3. `firewall`: اعمال سیاست پیش‌فرض بستن پورت‌ها و باز کردن SSH، 80 و 443.
4. `docker`: نصب رسمی Docker Engine، پلاگین Compose و افزودن کاربر به گروه docker.
5. `traefik`: ساخت مسیرها و دسترسی‌های ACME، ساخت شبکه Docker و اجرای Traefik با Docker Compose.

---

## ۸. راه‌اندازی Traefik با Docker Compose

سرویس Traefik به‌صورت خودکار توسط Role انسیبل راه‌اندازی می‌شود. در صورت نیاز به بررسی دستی یا راه‌اندازی مستقل روی سرور، فایل Compose آن در مسیر `/srv/traefik/docker-compose.yml` قرار دارد:

```bash
# بررسی وضعیت کانتینر Traefik
docker compose -f /srv/traefik/docker-compose.yml ps

# مشاهده لاگ‌های زمان اجرای Traefik
docker compose -f /srv/traefik/docker-compose.yml logs -f
```

برای متصل کردن هر اپلیکیشن کانتینری به Traefik در آینده، کافی است کانتینر به شبکه `traefik-public` متصل شده و برچسب‌های (Labels) مناسب Traefik روی آن تعریف شوند.

---

## ۹. هشدارهای امنیتی مهم

1. **بررسی Host Key در SSH:**
   تنظیم `host_key_checking` در فایل `ansible.cfg` فعال است. پیش از اجرای Ansible، یک بار به سرور متصل شوید یا کلید آن را در `known_hosts` ثبت کنید تا از حملات Man-In-The-Middle جلوگیری شود:
   ```bash
   ssh-keyscan -p 22 YOUR_SERVER_IP >> ~/.ssh/known_hosts
   ```
2. **محافظت از فایل ACME:**
   فایل کلیدهای خصوصی گواهی‌های SSL در `/srv/traefik/acme/acme.json` قرار دارد و مجوز دسترسی آن اکیداً روی `0600` تنظیم شده است تا کاربران غیرمجاز به کلیدهای TLS دسترسی نداشته باشند.
3. **دسترسی به Docker Socket:**
   پروکسی Traefik سوکت Docker را برای کشف خودکار سرویس‌ها به صورت Read-Only (`:ro`) مانت می‌کند. هرگز Docker Socket را به کانتینرهای عمومی یا نامطمئن مانت نکنید.
4. **داشبورد Traefik:**
   داشبورد مدیریتی Traefik به صورت پیش‌فرض غیرفعال (`--api.dashboard=false`) است و هیچ پورت کنترل یا پنل بدون احراز هویتی روی اینترنت باز نیست.

---

## ۱۰. محدودیت‌های نسخه اولیه

- در این مرحله استقرار خودکار اپلیکیشن‌ها، ساخت ایمیج‌ها و پایپ‌لاین‌های CI/CD در محدوده نسخه اولیه قرار ندارد و در فازهای بعدی اضافه خواهند شد.
- کلاسترینگ چندسروری (Multi-Node Swarm یا Kubernetes) پشتیبانی نمی‌شود و تمرکز نسخه اولیه بر پایداری، سادگی و امنیت تک‌سروری با Docker Compose است.
- سیستم‌های پشتیبان‌گیری خودکار دیتابیس و لاگین در این فاز حذف شده‌اند و مسئولیت بکاپ به عهده راهکارهای مستقل زیرساختی است.
