# DeployKit

جعبه‌ابزار متن‌باز آماده‌سازی سرور و زیرساخت میزبانی کانتینری مبتنی بر Docker Compose و Ansible برای Ubuntu Server LTS.

---

## ۱. DeployKit چیست؟

**DeployKit** یک مخزن ابزارمحور (Toolkit) است که به توسعه‌دهندگان و مدیران سیستم کمک می‌کند یک سرور خام **Ubuntu Server LTS** را با حداقل مراحل و به‌صورت استاندارد، امن و خودکار آماده کرده و سرویس‌های زیرساختی پایه (شامل Docker Engine، افزونه Docker Compose و پروکسی معکوس Traefik با گواهی SSL خودکار Let's Encrypt) را مستقر کنند.

DeployKit یک وب‌اپلیکیشن، سرویس SaaS، پنل مدیریتی یا پایگاه‌داده اختصاصی نیست و هیچ بار اضافی به سرور تحمیل نمی‌کند.

---

## ۲. توزیع‌های پشتیبانی‌شده و سیاست Ubuntu-only

DeployKit به‌صورت اختصاصی و بهینه‌سازی‌شده صرفاً برای نسخه‌های پایدار با پشتیبانی طولانی‌مدت اوبونتو طراحی شده است:

- **Ubuntu Server 24.04 LTS (Noble Numbat)**
- **Ubuntu Server 22.04 LTS (Jammy Jellyfish)**

### سلب پشتیبانی از سایر توزیع‌ها (Fail-Fast):
توزیع‌های مبتنی بر RHEL (مانند CentOS ،AlmaLinux ،Rocky Linux)، دبیان خام، Alpine Linux، آرچ، یا نسخه‌های غیر LTS اوبونتو به صورت رسمی پشتیبانی نمی‌شوند. پلی‌بوک در اولین گام با اجرای اعتبارسنجی پیش‌پرواز (Preflight Check)، در صورت اجرای روی هر سیستم‌عامل دیگر بلافاصله متوقف می‌شود تا از اعمال هرگونه تغییر ناقص یا ناسازگار جلوگیری کند.

---

## ۳. قابلیت‌ها و محدوده عملکرد

### چه کارهایی انجام می‌دهد:
- **اعتبارسنجی پیش‌پرواز (Preflight):** بررسی توزیع و نسخه سیستم‌عامل و توقف زودهنگام در صورت ناسازگاری.
- **به‌روزرسانی و نصب بسته‌های پایه:** تنظیم مخازن `apt`، نصب ابزارهای ضروری و پیکربندی منطقه زمانی سرور با `systemd-timesyncd`.
- **سخت‌سازی امنیتی SSH:** غیرفعال‌سازی ورود با رمز عبور (`PasswordAuthentication no`)، ورود ریشه (`PermitRootLogin no`) و پایش دسترسی‌ها.
- **فایروال هوشمند (UFW):** بستن تمامی ارتباطات ورودی پیش‌فرض، فعال‌سازی کنترل نرخ (Rate-Limit) برای SSH و باز کردن پورت‌های وب (`80` و `443`).
- **نصب رسمی Docker Engine:** دانلود کلید رسمی از مخزن داکر اوبونتو (`/etc/apt/keyrings/docker.asc`)، نصب پکیج‌های رسمی داکر و افزونه رسمی Docker Compose Plugin.
- **راه‌اندازی Traefik v3:** استقرار پروکسی معکوس با Docker Compose جهت مسیریابی خودکار ترافیک وب، هدایت خودکار HTTP به HTTPS و دریافت خودکار گواهی SSL از Let's Encrypt.
- **شبکه مشترک کانتینری:** ایجاد شبکه ایزوله سراسری (`traefik-public`) برای اتصال سرویس‌های آتی بدون نیاز به انتشار مستقیم پورت‌ها روی هاست.

### چه کارهایی انجام نمی‌دهد:
- استقرار خودکار اپلیکیشن دلخواه شما در این نسخه اولیه پیاده‌سازی نشده است.
- سیستم‌های مانیتورینگ، بکاپ، لاگین یا داشبورد اختصاصی راه‌اندازی نمی‌کند.
- از Docker Swarm یا Kubernetes در مسیر اصلی استفاده نمی‌کند.

---

## ۴. پیش‌نیازهای سیستم کنترل‌کننده (Client)

روی سیستمی که دستورات را اجرا می‌کنید (لوکال، CI یا ماشین مدیریت):
- سیستم‌عامل لینوکس، macOS یا WSL2 در ویندوز.
- پایتون نسخه 3.10 یا بالاتر.
- نصب `ansible-core` (نسخه ۲.۱۵ یا بالاتر):
  ```bash
  pip install ansible-core
  ```
- نصب کالکشن‌های مورد نیاز Ansible:
  ```bash
  ansible-galaxy collection install community.general community.docker ansible.posix
  ```
- کلید خصوصی SSH جهت اتصال به سرور مقصد.

---

## ۵. پیش‌نیازهای سرور مقصد (Ubuntu Server LTS)

- یک سرور مجازی یا اختصاصی خام (VPS یا Cloud Instance) با نصب تمیز **Ubuntu Server 24.04 LTS** یا **Ubuntu Server 22.04 LTS**.
- کاربر دارای دسترسی `sudo` بدون نیاز به رمز عبور (Passwordless Sudo) با احراز هویت کلید SSH (مانند کاربر پیش‌فرض `ubuntu`).
- پایتون ۳ (`python3` که به صورت پیش‌فرض در اوبونتو سرور موجود است).
- یک آدرس آی‌پی عمومی استاتیک (Public IP).
- اشاره دامنه یا زیردامنه به آی‌پی سرور برای صدور خودکار گواهی SSL توسط Let's Encrypt.

---

## ۶. دریافت پروژه (Clone)

```bash
git clone https://github.com/ehmoeini/DeployKit.git
cd DeployKit
```

---

## ۷. پیکربندی Inventory

یک نسخه از فایل نمونه اینونتوری ایجاد کنید:

```bash
cp ansible/inventory/example/hosts.yml.example ansible/inventory/hosts.yml
```

فایل `ansible/inventory/hosts.yml` را ویرایش کرده و مشخصات سرور اوبونتو خود را وارد کنید:

```yaml
---
all:
  children:
    deploykit_servers:
      hosts:
        server1:
          ansible_host: 203.0.113.10
          ansible_user: ubuntu
          ansible_port: 22
          ansible_python_interpreter: /usr/bin/python3

  vars:
    # ایمیل جهت ثبت در Let's Encrypt و دریافت هشدارهای انقضا
    acme_email: "admin@example.com"
```

> **نکته امنیتی:** مسیر `ansible/inventory/**/hosts.yml` در فایل `.gitignore` ثبت شده است و مشخصات سرور به مخزن گیت اضافه نخواهد شد.

---

## ۸. اجرای پلی‌بوک و آماده‌سازی سرور

برای شروع فرایند آماده‌سازی سرور، دستور زیر را اجرا کنید:

```bash
ansible-playbook -i ansible/inventory/hosts.yml ansible/playbooks/site.yml
```

### مراحل اجرای پلی‌بوک:
۱. `Preflight`: بررسی سیستم‌عامل سرور و توقف فوری در صورت عدم تطابق با Ubuntu 22.04/24.04.
۲. `common`: به‌روزرسانی مخازن `apt`، نصب بسته‌های پایه، تنظیم منطقه زمانی و هماهنگ‌سازی ساعت با `systemd-timesyncd`.
۳. `security`: سخت‌سازی پیکربندی SSH Daemon در اوبونتو.
۴. `firewall`: تنظیم سیاست‌های فایروال UFW و باز کردن پورت‌های SSH، 80 و 443.
۵. `docker`: نصب ایمن و رسمی Docker Engine و Docker Compose Plugin از ریپازیتوری رسمی داکر.
۶. `traefik`: ساخت دایرکتوری داده، فایل `acme.json` با دسترسی `0600`، ساخت شبکه `traefik-public` و راه‌اندازی Traefik با Docker Compose.

---

## ۹. مدیریت و بررسی Traefik

سرویس Traefik در مسیر `/opt/deploykit/traefik` مستقر می‌شود. برای بررسی وضعیت یا مشاهده لاگ‌های آن روی سرور:

```bash
# بررسی وضعیت کانتینر
docker compose -f /opt/deploykit/traefik/docker-compose.yml ps

# مشاهده زنده لاگ‌ها
docker compose -f /opt/deploykit/traefik/docker-compose.yml logs -f
```

---

## ۱۰. نکات و هشدارهای امنیتی

۱. **بررسی Host Key در SSH:**
گزینه `host_key_checking` در `ansible.cfg` فعال است. پیش از اجرای پلی‌بوک، کلید سرور مقصد را در `known_hosts` اضافه کنید:
```bash
ssh-keyscan -p 22 YOUR_SERVER_IP >> ~/.ssh/known_hosts
```

۲. **مجوز فایل ACME:**
فایل ذخیره‌سازی گواهی‌های SSL در مسیر `/opt/deploykit/traefik/acme.json` دارای دسترسی اکید `0600` و متعلق به `root` است تا امنیت کلیدهای خصوصی تضمین شود.

۳. **سوکت داکر (Docker Socket):**
دسترسی به سوکت داکر برای Traefik به صورت فقط‌خواندنی (`:ro`) تعریف شده است. سوکت داکر را در اختیار کانتینرهای عمومی یا غیرمطمئن قرار ندهید.

۴. **داشبورد Traefik:**
داشبورد وب Traefik به‌صورت پیش‌فرض غیرفعال (`--api.dashboard=false`) است و هیچ درگاه مدیریتی بدون احراز هویت روی اینترنت باز نیست.
