# DeployKit

استقرار خودکار پروژه، روی سرور شخصی با سیستم‌عامل‌های خانواده **Debian** (مانند **Ubuntu 22.04+ LTS** و **Debian 12+**) و خانواده **RedHat** (مانند **Amazon Linux 2023** و **Rocky / AlmaLinux / RHEL 9+**) با کمک هوش مصنوعی، Ansible، Docker و Traefik (همراه با گواهی SSL خودکار Let's Encrypt).

---

## پیش‌نیازها

- یک سرور خام با یکی از توزیع‌های لینوکس پشتیبانی‌شده:
  - **خانواده Debian:** اوبونتو (**Ubuntu 22.04+ LTS**) یا دبیان (**Debian 12+**)
  - **خانواده RedHat:** آمازون لینوکس (**Amazon Linux 2023**) یا **Rocky / AlmaLinux / RHEL 9+**
  با دسترسی `root` یا کاربر پیش‌فرض SSH.
- نصب بودن `ansible` و `ssh` روی سیستم شما (در ویندوز داخل WSL).
- **تنظیمات فایروال ابری:** در صورتی که از سرورهای ابری (مانند AWS EC2) استفاده می‌کنید، پورت‌های ورودی `22` (SSH)، `80` (HTTP) و `443` (HTTPS) را در پنل Security Group / Firewall ارائه‌دهنده ابری خود باز بگذارید.

---

## نحوه استفاده (فقط در ۲ قدم)

1. این پروژه را در ادیتور مجهز به هوش مصنوعی خود (Cursor، Windsurf، Antigravity، VS Code Copilot یا Claude Code) باز کنید.
2. به AI Agent خود بگویید:

> «فایل `.agents/skills/deploykit/SKILL.md` را بخوان و طبق مراحل آن، پروژه من را روی سرورم مستقر کن.»
