# دستورالعمل ۱۲: چارچوب جامع مدیریت زیرساخت و استقرار با Ansible

این سند پیاده‌سازی کامل چارچوب Ansible در دایرکتوری `ansible/`، شامل ساختار ماژولار رول‌ها، Inventory چند محیطی، فایروال هوشمند ضد قفل شدن SSH (Anti-Lockout)، رول‌های امنیتی، ممیزی ایمن دیسک و چرخه Playbookهای استقرار، ارتقا و بازگشت به عقب (Rollback) را شرح می‌دهد.

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
| `docker`       | نصب رسمی Docker Engine، پیکربندی لاگ‌چرخشی داکر و فعال‌سازی سرویس.                                 |
| `traefik`      | ایجاد شبکه `traefik-public`، فایل `acme.json` با دسترسی `600` و استقرار Traefik.                 |
| `application`  | استقرار کانتینرهای برنامه بر پایه `docker-compose.yml` و اجرای Migration.                        |
| `backup`       | راه‌اندازی تایمرهای Systemd روی Host برای اجرای منظم اسکریپت‌های پشتیبان‌گیری.                      |
| `watchtower`   | رول اختیاری آپدیت کانتینرها (در Production برای اپلیکیشن غیرفعال است).                           |

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

### ۲.۷. چرخه استقرار، ارتقا و بازگشت به عقب (`ansible/playbooks/rollback.yml`)
این پلی‌بوک بازگردانی نسخه قبلی را بدون نیاز به ادیت دستی فایل‌ها انجام می‌دهد:

```yaml
---
- name: Instant Application Rollback
  hosts: servers
  become: true
  vars_prompt:
    - name: target_rollback_tag
      prompt: "Enter the Target Git Short-SHA / Image Tag to roll back to"
      private: false
  tasks:
    - name: Validate rollback tag input
      ansible.builtin.assert:
        that:
          - target_rollback_tag is defined
          - target_rollback_tag | length > 0
        fail_msg: "Rollback target tag cannot be empty!"

    - name: Deploy application with rollback tag
      ansible.builtin.include_role:
        name: application
      vars:
        app_image_tag: "{{ target_rollback_tag }}"

    - name: Run health check validation after rollback
      ansible.builtin.uri:
        url: "http://127.0.0.1:3000/health/ready"
        status_code: 200
      register: health_check
      until: health_check.status == 200
      retries: 6
      delay: 5

    - name: Log Rollback event to Audit Trail
      ansible.builtin.lineinfile:
        path: "/srv/{{ project_name }}/deployments.log"
        line: "[{{ ansible_date_time.iso8601 }}] ROLLBACK to tag: {{ target_rollback_tag }} by {{ lookup('env', 'USER') }}"
        create: true
        mode: '0640'
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۱۲
- [ ] ساختار پوشه‌های `ansible/` با تفکیک کامل رول‌ها پیاده‌سازی شده باشد.
- [ ] تست اجرای `storage-audit.yml` بدون ایجاد هیچ‌گونه تغییر روی دیسک اجرا شود.
- [ ] رول `firewall` پورت SSH را به عنوان اولین قانون تثبیت کرده و از Lockout جلوگیری نماید.
- [ ] فایل `ansible.cfg` از فایل Vault خارج از Git پشتیبانی کند.
- [ ] پلی‌بوک `rollback.yml` امکان دریافت تگ کامیت قبلی و اعمال سریع آن را فراهم سازد.
