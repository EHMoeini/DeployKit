# دستورالعمل ۱۲: چارچوب جامع مدیریت زیرساخت و استقرار با Ansible

این سند پیاده‌سازی کامل چارچوب Ansible در دایرکتوری `ansible/`، شامل ساختار ماژولار رول‌ها، Inventory چند محیطی، فایروال هوشمند ضد قفل شدن SSH (Anti-Lockout)، رول‌های امنیتی، ممیزی ایمن دیسک، راه‌اندازی Docker Swarm، چرخه Playbookهای استقرار، ارتقا، بازگشت به عقب (Rollback) و حذف قابل بازگشت (Teardown) را شرح می‌دهد.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `11`.
- نصب بودن `ansible-core` و ماژول‌های مورد نیاز بر روی ماشین کنترل.

---

## ۲. گام‌های اجرایی

### ۲.۱. فایل تنظیمات Ansible (`ansible/ansible.cfg`)

```ini
[defaults]
inventory = inventory/production/hosts.yml
roles_path = roles
remote_user = deployer
host_key_checking = True
retry_files_enabled = False
stdout_callback = yaml
timeout = 30
vault_password_file = vault/vault_pass.txt

[privilege_escalation]
become = True
become_method = sudo
become_user = root
become_ask_pass = False

[ssh_connection]
pipelining = True
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=accept-new
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

### ۲.۳. فایل‌های Inventory نمونه (`ansible/inventory/production/hosts.yml`)
هیچ پارامتر اتصالی نباید در رول‌ها Hardcode شود:

```yaml
all:
  children:
    servers:
      hosts:
        prod-server-01:
          ansible_host: 203.0.113.10
          ansible_user: deployer
          ansible_port: 22
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519_deployer
  vars:
    environment_tier: production
    project_name: liquid-portal
    domain: portal.example.com
```

---

### ۲.۴. معماری رول‌های Ansible در `ansible/roles/`

| نام رول (Role) | وظیفه و سطح دسترسی                                                                               |
| :------------- | :----------------------------------------------------------------------------------------------- |
| `common`       | به‌روزرسانی سیستم‌عامل، نصب ابزارهای پایه (`curl`, `git`, `htop`, `jq`, `ca-certificates`).        |
| `security`     | پیکربندی SSH سخت‌گیرانه (غیرفعال‌سازی ورود با پسورد و ورود مستقیم root)، نصب `fail2ban`.           |
| `firewall`     | پیاده‌سازی فایروال با سیاست Default Deny، مکانیزم Anti-Lockout و سازگاری با زنجیره `DOCKER-USER`. |
| `storage`      | ممیزی ایمن دیسک، بررسی Persistent/Ephemeral بودن پارتیشن‌ها بدون اعمال تغییر ناخواسته.            |
| `docker`       | نصب رسمی Docker Engine و Python SDK، راه‌اندازی Docker Swarm و ساخت شبکه‌های overlay (`app-internal`, `traefik-public`). |
| `traefik`      | آماده‌سازی `acme.json` با دسترسی `600` و استقرار استک Traefik روی نود manager.                     |
| `application`  | استقرار استک برنامه با ۳ رپلیکای فرانت و ۴ رپلیکای بک‌اند، اجرای Migration و بررسی سلامت.          |
| `backup`       | راه‌اندازی تایمرهای Systemd روی Host برای اجرای منظم اسکریپت‌های پشتیبان‌گیری.                      |
| `watchtower`   | نصب عامل به‌روزرسانی خودکار سازگار با Swarm روی نود manager؛ بررسی دوره‌ای GHCR، اجرای Migration و `docker service update` با rolling update. |

---

### ۲.۵. رول فایروال ضد قطع دسترسی (`ansible/roles/firewall/tasks/main.yml`)
این تسک با شناسایی پورت جاری SSH مانع از Lockout شدن مدیر می‌شود:

```yaml
---
- name: Determine current SSH port
  ansible.builtin.set_fact:
    active_ssh_port: "{{ ansible_port | default(22) }}"

- name: Set UFW default policies (deny incoming, allow outgoing)
  community.general.ufw:
    direction: "{{ item.direction }}"
    policy: "{{ item.policy }}"
  loop:
    - { direction: 'incoming', policy: 'deny' }
    - { direction: 'outgoing', policy: 'allow' }

- name: Ensure SSH access is explicitly allowed BEFORE enabling firewall (Anti-Lockout)
  community.general.ufw:
    rule: allow
    port: "{{ active_ssh_port }}"
    proto: tcp
    comment: "Management SSH Access"

- name: Allow HTTP and HTTPS traffic for Traefik
  community.general.ufw:
    rule: allow
    port: "{{ item }}"
    proto: tcp
    comment: "Public Web Traffic"
  loop:
    - "80"
    - "443"

- name: Prevent Docker bypass - Ensure PostgreSQL port is NOT publicly exposed
  community.general.ufw:
    rule: deny
    port: "5432"
    proto: tcp
    comment: "Block Public Postgres"

- name: Enable UFW service
  community.general.ufw:
    state: enabled
```

---

### ۲.۶. پلی‌بوک‌های ممیزی ایمن دیسک (`ansible/playbooks/storage-audit.yml`)
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

### ۲.۷. چرخه استقرار، ارتقا، بازگشت و Teardown
- `site.yml` زیرساخت را آماده می‌کند: نصب Docker و SDK پایتون، راه‌اندازی Docker Swarm، ساخت شبکه‌های overlay، استقرار Traefik، نصب بکاپ، استقرار استک برنامه و در نهایت نصب عامل به‌روزرسانی خودکار.
- `deploy.yml` استک برنامه را به‌روزرسانی می‌کند و رول `watchtower` را نیز اجرا می‌کند تا تایمر/کانفیگ عامل خودکار همیشه همگام بماند. `application` پیش از roll-out، Migration را با همان ایمیج اجرا می‌کند و سپس ۳ رپلیکای فرانت‌اند و ۴ رپلیکای بک‌اند را با rolling update (ترتیب `start-first`) مستقر می‌کند.
- رول `application` پس از استقرار، converge شدن تعداد رپلیکاها و سلامت بک‌اند را از داخل شبکه داخلی بررسی می‌کند.
- `rollback.yml` تگ هدف را از اپراتور می‌گیرد و همان رول را با ایمیج قدیمی اجرا می‌کند؛ در صورت شکست healthcheck، عملیات ناموفق گزارش می‌شود.
- `teardown.yml` ابتدا پرچم توقف را می‌سازد، تایمر و سرویس عامل خودکار را متوقف می‌کند، با `flock` استک را حذف می‌کند و در پایان پرچم را پاک می‌کند؛ داده‌ها، شبکه‌ها و Swarm دست‌نخورده می‌مانند تا revert امن باشد.
- کلیدهای حساس از Ansible Vault یا `-e` تأمین می‌شوند؛ در صورت نبود، رول با پیام واضح متوقف می‌شود.

---

### ۲.۸. عامل به‌روزرسانی خودکار سازگار با Swarm (رول `watchtower`)

Watchtower اصلی فقط کانتینرهای مستقل را مدیریت می‌کند و اگر روی کانتینرهای task در Swarm اجرا شود، taskها را خارج از سرویس بازسازی می‌کند و reconciler سوئرم آن‌ها را حذف می‌کند. بنابراین رول `watchtower` یک عامل کوچک Swarm-native نصب می‌کند که همان قرارداد را دارد:

| فایل | نقش |
| :--- | :--- |
| `ansible/roles/watchtower/defaults/main.yml` | `auto_update_enabled: true`، `auto_update_interval: 5min`، `auto_update_tag: latest` |
| `ansible/roles/watchtower/files/watchtower.sh` | منطق اصلی: pull، مقایسه دیجست، Migration، `docker service update` و rollback |
| `ansible/roles/watchtower/templates/watchtower.env.j2` | نام سرویس‌ها، تگ کانال، مسیر `.env`، قفل و لاگ |
| `ansible/roles/watchtower/templates/watchtower.service.j2` | یونیت `Type=oneshot` با `TimeoutStartSec=45min` |
| `ansible/roles/watchtower/templates/watchtower.timer.j2` | اجرای دوره‌ای با `OnUnitActiveSec={{ auto_update_interval }}` |

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
- [ ] تست اجرای `storage-audit.yml` بدون ایجاد هیچ‌گونه تغییر روی دیسک اجرا شود.
- [ ] رول `firewall` پورت SSH را به عنوان اولین قانون تثبیت کرده و از Lockout جلوگیری نماید.
- [ ] فایل `ansible.cfg` از فایل Vault خارج از Git پشتیبانی کند.
- [ ] رول `docker` به‌صورت idempotent سوئرم را راه‌اندازی کرده و شبکه‌های overlay را بسازد.
- [ ] استقرار، Migration، بررسی سلامت و تعداد رپلیکاها (۳ فرانت / ۴ بک‌اند) کاملاً از طریق Ansible انجام شود.
- [ ] پلی‌بوک `rollback.yml` امکان دریافت تگ قبلی و پلی‌بوک `teardown.yml` امکان حذف امن استک‌ها را فراهم کند.
- [ ] رول `watchtower` روی نود manager نصب شده و تایمر آن در اولین اجرای `site.yml` فعال شود.
- [ ] هر دو مسیر Ansible و عامل خودکار از قفل مشترک `.deploy.lock` و پرچم `.deploy-in-progress` استفاده کنند.
- [ ] عامل خودکار فقط تگ `auto_update_tag` را دنبال کند و سرویس‌های pin‌شده به `<short-sha>` را تغییر ندهد.
- [ ] اجرای دوباره `site.yml`/`deploy.yml` باعث rolling update تکراری برای یک انتشار نشود.
