# دستورالعمل ۱۲: چارچوب جامع مدیریت زیرساخت و استقرار با Ansible

این سند پیاده‌سازی کامل چارچوب Ansible در دایرکتوری `ansible/` را تشریح می‌کند. هدف بنیادین این ساختار، **استقرار کاملاً خودکار، بدون پیش‌نیاز و تک‌دستوری (Turn-key / Zero-Touch Deployment)** است؛ به گونه‌ای که هر کاربری با برداشتن پروژه از گیت‌هاب، صرفاً با مشخص کردن آی‌پی سرور در Inventory، بتواند تنها با اجرای یک اسکریپت یا پلی‌بوک (`./deploy.sh` یا `site.yml`)، سرور خام (از هر توزیع لینوکسی مانند Ubuntu، Debian، CentOS یا Amazon Linux) را به طور کامل پیکربندی و برنامه را به صورت پروداکشن همراه با SSL خودکار و کلاستر Docker Swarm مستقر کند.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `11`.
- نصب بودن `ansible-core` (نسخه ۲.۱۵ یا بالاتر) بر روی ماشین کنترل کننده (کلاینت کاربر).
- دسترسی SSH به سرور هدف (با کلید یا پسورد). هیچ پیش‌نیازی مانند نصب بودن پایتون روی سرور مقصد لازم نیست.

---

## ۲. گام‌های اجرایی

### ۲.۱. فایل تنظیمات Ansible (`ansible/ansible.cfg`)
تنظیمات باید به گونه‌ای باشد که اتصال اولیه بدون اختلال در کلید میزبان انجام شده و عدم وجود فایل Vault مانع اجرای دستورات نشود:

```ini
[defaults]
inventory = inventory/production/hosts.yml
roles_path = roles
host_key_checking = False
retry_files_enabled = False
stdout_callback = default
timeout = 30
deprecation_warnings = False

[privilege_escalation]
become = True
become_method = sudo
become_user = root
become_ask_pass = False

[ssh_connection]
pipelining = True
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
```

---

### ۲.۲. نیازمندی‌های کالکشن‌ها (`ansible/requirements.yml`)

```yaml
collections:
  - name: community.general
    version: ">=8.0.0"
  - name: community.docker
    version: ">=3.8.0"
  - name: ansible.posix
    version: ">=1.5.0"
```

---

### ۲.۳. ساختار Inventory ساده‌سازی‌شده و دو زبانه (`ansible/inventory/production/hosts.yml`)
برای سهولت کار کاربران بدون دانش لینوکس و انسیبل، Inventory به ۴ بخش تفکیک‌شده و واضح تقسیم شده است تا شخص تنها با تغییر چند متغیر بتواند دپلوی کند:

```yaml
all:
  children:
    servers:
      hosts:
        production-server:
          # =========================================================================
          # 1. SERVER CONNECTION / مشخصات اتصال به سرور شما
          # =========================================================================
          ansible_host: 203.0.113.10               # آی‌پی سرور شما
          ansible_user: root                      # نام کاربر SSH (مانند root، ubuntu، ec2-user)
          ansible_port: 22                        # پورت SSH (پیش‌فرض: 22)
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519 # مسیر کلید خصوصی SSH
          # ansible_password: "your_password"     # در صورت استفاده از پسورد به جای کلید، این خط را فعال کنید

  vars:
    # =========================================================================
    # 2. GENERAL SETTINGS / تنظیمات عمومی و دامنه
    # =========================================================================
    environment_tier: production
    project_name: liquid-portal

    # دامنه: در صورت استفاده از مقدار پیش‌فرض "{{ ansible_host }}.nip.io"، به طور خودکار
    # دی‌ان‌اس رایگان تنظیم شده و گواهی معتبر SSL از Let's Encrypt دریافت می‌شود.
    domain: "{{ ansible_host }}.nip.io"
    acme_email: "admin@{{ ansible_host }}.nip.io"

    # =========================================================================
    # 3. CONTAINER IMAGES / ایمیج‌های داکر برنامه
    # =========================================================================
    # آدرس ایمیج‌های بیلد شده فرانت‌اند و بک‌اند (از Docker Hub، GHCR یا رجیستری‌های دیگر):
    backend_image: "ghcr.io/your-user/backend:latest"
    frontend_image: "ghcr.io/your-user/frontend:latest"

    # مشخصات رجیستری (اختیاری - فقط در صورتی که ایمیج‌های شما خصوصی هستند نیاز است):
    ghcr_owner: your-user
    ghcr_repo: deploy-with-agent
    ghcr_token: ""

    # =========================================================================
    # 4. APPLICATION SECRETS / رمزهای عبور و کلیدهای امنیتی (دارای مقادیر پیش‌فرض امن)
    # =========================================================================
    db_password: strong_postgres_password_here
    jwt_secret: super_secret_jwt_access_token_signing_key_at_least_32_chars
    refresh_token_secret: super_secret_refresh_token_hmac_key_at_least_32_chars
    csrf_secret: super_secret_csrf_token_signing_salt_key
```

---

### ۲.۴. معماری رول‌های Ansible با پشتیبانی از چند توزیع لینوکس

| نام رول (Role) | وظیفه و سطح دسترسی (سازگار با دبیان، اوبونتو، ردهت و آمازون لینوکس)                                   |
| :------------- | :---------------------------------------------------------------------------------------------------- |
| `common`       | به‌روزرسانی سیستم، نصب پکیج‌های پایه و ساخت خودکار گروه و کاربر `deployer` با دسترسی `sudo`/`wheel`.    |
| `security`     | تنظیم امنیتی SSH به همراه مکانیزم تشخیص ورود با پسورد جهت جلوگیری از قفل شدن دسترسی و نصب `fail2ban`. |
| `firewall`     | فایروال با سیاست Default Deny، مکانیزم Anti-Lockout بر روی پورت جاری SSH و سازگار با UFW / firewalld. |
| `storage`      | ممیزی کاملاً فقط‌خواندنی دیسک، بررسی ساختار پارتیشن‌ها بدون ایجاد تغییر ناخواسته.                        |
| `docker`       | نصب رسمی Docker Engine و پایتون داکر SDK بر روی دبیان/ردهت، راه‌اندازی Swarm و ساخت شبکه‌های overlay.   |
| `traefik`      | آماده‌سازی `acme.json` با دسترسی `600` و استقرار استک Traefik v3 روی نود manager با SSL خودکار.        |
| `application`  | استقرار استک برنامه (۴ بک‌اند و ۳ فرانت‌اند)، اجرای Migration با ایمیج ریلیز و بررسی سلامت شبکه داخلی.  |
| `backup`       | راه‌اندازی سرویس و تایمر Systemd روی Host برای اجرای منظم اسکریپت‌های پشتیبان‌گیری در 03:00 بامداد.      |
| `watchtower`   | نصب عامل به‌روزرسانی خودکار سازگار با Swarm روی نود manager؛ بررسی دوره‌ای، Migration و rolling update. |

---

### ۲.۵. پیش‌راه‌اندازی سراسری و خودکار پایتون (Universal Raw Bootstrap)
روی یک سرور لینوکسی کاملاً خام ممکن است حتی مفسر `python3` یا `sudo` نصب نباشد. بنابراین در ابتدای پلی‌بوک اصلی `ansible/playbooks/site.yml`، یک تسک خام با `gather_facts: false` قرار دارد که پکیج‌منیجر سرور را تشخیص داده و پایتون و نیازمندی‌ها را به صورت خودکار نصب می‌کند:

```yaml
---
- name: Bootstrap Target Host (Python and Core Environment)
  hosts: servers
  gather_facts: false
  become: true
  tasks:
    - name: Ensure Python 3 and essential prerequisites are installed (Universal Raw Bootstrap)
      ansible.builtin.raw: >
        which python3 >/dev/null 2>&1 || (
          (command -v apt-get >/dev/null 2>&1 && (DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-pip sudo)) ||
          (command -v dnf >/dev/null 2>&1 && dnf install -y python3 python3-pip sudo) ||
          (command -v yum >/dev/null 2>&1 && yum install -y python3 python3-pip sudo) ||
          (command -v apk >/dev/null 2>&1 && apk add --no-cache python3 py3-pip sudo bash)
        )
      changed_when: false
```

---

### ۲.۶. رول‌های امنیت، کاربر و فایروال ضد قطع دسترسی (Anti-Lockout)
1. **ساخت کاربر در رول `common`:** گروه و کاربر `deployer` با دسترسی `sudo` بدون پسورد در توزیع‌های دبیان (`sudo`) و ردهت (`wheel`) به صورت خودکار ساخته می‌شوند.
2. **عدم قفل شدن SSH در رول `security`:** تنظیم پارامتر `PasswordAuthentication` به صورت پویا تعیین می‌شود؛ اگر کاربر با پسورد لاگین کرده باشد، ورود با پسورد فعال می‌ماند تا دسترسی قطع نشود.
3. **فایروال در رول `firewall`:**
   - پورت جاری SSH به صورت پویا کشف شده و پیش از فعال‌سازی فایروال باز می‌شود.
   - پورت‌های 80 و 443 برای Traefik باز و پورت 5432 دیتابیس برای اینترنت مسدود می‌گردد.
   - در اوبونتو/دبیان از `ufw` و در ردهت/آمازون لینوکس از `firewalld` (یا لایه امنیتی `iptables`) استفاده می‌شود.

---

### ۲.۷. پلی‌بوک‌های ممیزی ایمن دیسک (`ansible/playbooks/storage-audit.yml`)
این پلی‌بوک کاملاً فقط‌خواندنی است و اطلاعات دیسک و پارتیشن‌ها را بدون دست‌کاری ذخیره می‌کند:

```yaml
---
- name: Comprehensive Storage and Disk Audit (Read-Only)
  hosts: servers
  become: true
  tasks:
    - name: Gather block devices and partition layout
      ansible.builtin.command: lsblk -e7 -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,UUID,MODEL
      register: lsblk_out
      changed_when: false

    - name: Gather LVM Volume Group information
      ansible.builtin.command: vgs --noheadings -o vg_name,vg_size,vg_free
      register: vgs_out
      changed_when: false
      failed_when: false

    - name: Gather Mount points and free space
      ansible.builtin.command: df -h -T / /boot /var
      register: df_out
      changed_when: false

    - name: Save Storage Audit Artifact locally
      ansible.builtin.copy:
        content: |
          STORAGE AUDIT REPORT - {{ inventory_hostname }}
          Timestamp: {{ ansible_date_time.iso8601 }}
          --------------------------------------------------
          BLOCK DEVICES:
          {{ lsblk_out.stdout }}

          LVM VOLUME GROUPS:
          {{ vgs_out.stdout | default('No LVM VGs found') }}

          FILESYSTEM CAPACITY:
          {{ df_out.stdout }}
        dest: "artifacts/storage_audit_{{ inventory_hostname }}.txt"
      delegate_to: localhost
      become: false
```

---

### ۲.۸. چرخه استقرار تک‌دستوری (Turn-key Deployment)، ارتقا، بازگشت و Teardown

#### اسکریپت دپلوی با یک دستور (`deploy.sh`)
کاربر تنها با اجرای `./deploy.sh` کل فرآیند زیر را بدون نیاز به تایپ دستی پارامترهای طولانی اجرا می‌کند:
- **`site.yml` (پلی‌بوک جامع دپلوی اولیه):**
  1. اجرای Universal Raw Bootstrap برای اطمینان از وجود Python 3 روی سرور خام.
  2. آماده‌سازی زیرساخت، ساخت کاربر `deployer`، ایمن‌سازی SSH و فایروال.
  3. نصب Docker Engine و Python Docker SDK و راه‌اندازی کلاستر Docker Swarm.
  4. ساخت شبکه‌های overlay ایزوله (`app-internal` و `traefik-public`).
  5. استقرار پروکسی معکوس Traefik v3 با تنظیم خودکار SSL (دامنه اختصاصی یا Wildcard nip.io).
  6. راه‌اندازی سرویس تایمر بکاپ روزانه دیتابیس در Systemd.
  7. اجرای Migration پایگاه‌داده پیش از انتشار کانتینرها.
  8. استقرار ۴ رپلیکای بک‌اند و ۳ رپلیکای فرانت‌اند همراه با Rolling Update و بررسی سلامت.
  9. راه‌اندازی عامل به‌روزرسانی خودکار Swarm-native.
- **`deploy.yml`:** استک برنامه را با تگ جدید یا کانال `latest` به‌روزرسانی می‌کند.
- **`rollback.yml`:** بازگشت دقیق و بدون قطعی به تگ یا SHA مشخص را انجام می‌دهد.
- **`teardown.yml`:** حذف امن استک‌ها و منابع موقت با رعایت قفل مشترک، بدون دست‌کاری داده‌های پایدار.

---

### ۲.۸. عامل به‌روزرسانی خودکار سازگار با Swarm (رول `watchtower`)

Watchtower اصلی فقط کانتینرهای مستقل را مدیریت می‌کند و اگر روی کانتینرهای task در Swarm اجرا شود، taskها را خارج از سرویس بازسازی می‌کند و reconciler سوئرم آن‌ها را حذف می‌کند. بنابراین رول `watchtower` یک عامل کوچک Swarm-native نصب می‌کند که همان قرارداد را دارد:

| فایل                                                       | نقش                                                                                  |
| :--------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `ansible/roles/watchtower/defaults/main.yml`               | `auto_update_enabled: true`، `auto_update_interval: 5min`، `auto_update_tag: latest` |
| `ansible/roles/watchtower/files/watchtower.sh`             | منطق اصلی: pull، مقایسه دیجست، Migration، `docker service update` و rollback         |
| `ansible/roles/watchtower/templates/watchtower.env.j2`     | نام سرویس‌ها، تگ کانال، مسیر `.env`، قفل و لاگ                                        |
| `ansible/roles/watchtower/templates/watchtower.service.j2` | یونیت `Type=oneshot` با `TimeoutStartSec=45min`                                      |
| `ansible/roles/watchtower/templates/watchtower.timer.j2`   | اجرای دوره‌ای با `OnUnitActiveSec={{ auto_update_interval }}`                         |

رفتار عامل:

1. پرچم `/srv/<project>/.deploy-in-progress` را بررسی می‌کند؛ اگر کمتر از ۳۰ دقیقه قدمت داشته باشد، چرخه را رد می‌کند.
2. با `flock -n` قفل `/srv/<project>/.deploy.lock` را می‌گیرد؛ در صورت اشغال توسط Ansible، چرخه را رد می‌کند.
3. تگ تصویر سرویس را از `docker service inspect` می‌خواند؛ اگر برابر `auto_update_tag` نباشد (مثلاً pin شده به `<short-sha>`)، آن سرویس را رها می‌کند.
4. تصویر را `docker pull` می‌کند و دیجست `RepoDigests` همان مخزن را با دیجست سرویس مقایسه می‌کند.
5. در صورت تفاوت، برای بک‌اند ابتدا `node src/config/run-migrations.js` را با ایمیج جدید اجرا می‌کند؛ شکست Migration کل چرخه را متوقف می‌کند.
6. `docker service update --with-registry-auth --image <repo>:<tag>@sha256:<digest>` را اجرا می‌کند؛ pin کردن دیجست مانع جابه‌جایی تگ میان pull و update می‌شود. Swarm خود rolling update را طبق `update_config` انجام می‌دهد.
7. فقط پس از موفقیت بک‌اند، فرانت‌اند را به‌روزرسانی می‌کند؛ در شکست update، `docker service update --rollback` را صدا می‌زند.

**قرارداد عدم تداخل با Ansible:**
- در رول `application`، پرچم `.deploy-in-progress` در ابتدا ساخته و در پایان حذف می‌شود تا فاصله بین دو قفل‌گیری جداگانه (Migration و `docker stack deploy`) بسته شود.
- هر دو دستور Migration و `docker stack deploy` در Ansible با `flock -w 900 /srv/<project>/.deploy.lock` اجرا می‌شوند.
- چون هر دو طرف قبل از تغییر، دیجست/تگ فعلی سرویس را مقایسه می‌کنند، برای یک انتشار فقط یک rolling update رخ می‌دهد: اگر Ansible اول اجرا شود، عامل خودکار دیجست یکسان می‌بیند؛ اگر عامل خودکار اول اجرا شود، `docker stack deploy` بعدی همان دیجست را resolve می‌کند.
- استقرار با تگ immutable (Rollback) سرویس را از کانال `latest` خارج می‌کند؛ برای بازگشت به به‌روزرسانی خودکار باید دوباره با `image_tag=latest` مستقر شود.

---

## ۳. چک‌لیست اعتبارسنجی گام ۱۲
- [ ] ساختار پوشه‌های `ansible/` با تفکیک کامل رول‌ها پیاده‌سازی شده باشد.
- [ ] مرحله Pre-flight Universal Raw Bootstrap در `site.yml` پایتون، pip و sudo را روی سرور خام نصب کند.
- [ ] سازگاری چندتوزیعی (Debian/Ubuntu و RedHat/CentOS/Amazon Linux) در رول‌های `common`، `docker`، `firewall` و `security` به طور کامل تست شود.
- [ ] ساختار `inventory/production/hosts.yml` به صورت دو زبانه و ساده، تنها با نیاز به تنظیم آی‌پی سرور باشد.
- [ ] صدور خودکار SSL با Let's Encrypt و ساخت دامنه خودکار `{{ ansible_host }}.nip.io` به طور یکپارچه کار کند.
- [ ] تست اجرای `storage-audit.yml` بدون ایجاد هیچ‌گونه تغییر روی دیسک اجرا شود.
- [ ] رول `firewall` پورت SSH را به عنوان اولین قانون تثبیت کرده و از Lockout جلوگیری نماید.
- [ ] فایل `ansible.cfg` اتصال بدون اختلال را تضمین کرده و بدون نیاز اجباری به Vault اجرا شود.
- [ ] رول `docker` به‌صورت idempotent داکر و SDK پایتون را نصب، سوئرم را راه‌اندازی و شبکه‌های overlay را بسازد.
- [ ] استقرار، Migration، بررسی سلامت و تعداد رپلیکاها (۳ فرانت / ۴ بک‌اند) کاملاً با اجرای تک‌دستوری `./deploy.sh` یا `site.yml` انجام شود.
- [ ] پلی‌بوک `rollback.yml` امکان دریافت تگ قبلی و پلی‌بوک `teardown.yml` امکان حذف امن استک‌ها را فراهم کند.
- [ ] رول `watchtower` روی نود manager نصب شده و تایمر آن در اولین اجرای `site.yml` فعال شود.
- [ ] هر دو مسیر Ansible و عامل خودکار از قفل مشترک `.deploy.lock` و پرچم `.deploy-in-progress` استفاده کنند.
- [ ] عامل خودکار فقط تگ `auto_update_tag` را دنبال کند و سرویس‌های pin‌شده به `<short-sha>` را تغییر ندهد.
- [ ] اجرای دوباره `site.yml`/`deploy.yml` باعث rolling update تکراری برای یک انتشار نشود.
