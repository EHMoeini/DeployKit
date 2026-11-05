# دستورالعمل ۰۸: کانتینرسازی بک‌اند و ساختارهای Docker Compose محلی و استک Docker Swarm تولید

این سند نحوه کانتینرسازی بهینه سرویس Backend، ایجاد فایل `docker-compose.local.yml` برای اجرای تست‌های مقیاس‌پذیری چند Replica به همراه Traefik محلی، و ساخت استک تولید `docker-compose.yml` برای اجرا روی Docker Swarm با ایمیج‌های رجیستری GHCR را مشخص می‌کند.

---

## ۱. پیش‌نیازها
- اتمام موفق مراحل `01` تا `07`.
- فایل‌های کد منبع `backend` و `frontend` آماده بسته‌بندی در کانتینر باشند.

---

## ۲. گام‌های اجرایی

### ۲.۱. داکرفایل چندمرحله‌ای بک‌اند (`backend/Dockerfile`)
ساخت ایمیج سبک و امن Node.js با حذف فایل‌های اضافی بیلد و اجرای با کاربر غیر روت (`node`):

```dockerfile
# ==============================================================================
# Stage 1: Build & Dependencies
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
# نصب تمام وابستگی‌ها از جمله DevDependencies در صورت نیاز به کامپایل
RUN npm ci

COPY . .

# ==============================================================================
# Stage 2: Production Runtime
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# کپی فایل‌ها از مرحله بیلد
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/migrations ./migrations

# ایجاد پوشه آپلود و اعطای مجوز به کاربر غیر روت
RUN mkdir -p /srv/portal/uploads && \
    chown -R node:node /app /srv/portal/uploads

USER node

EXPOSE 3000

# بررسی سلامت کانتینر
HEALTHCHECK --interval=20s --timeout=4s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "src/index.js"]
```

---

### ۲.۲. فایل اجرای محلی و تست مقیاس‌پذیری (`docker-compose.local.yml`)
این فایل برای تست تمام سناریوها روی سیستم توسعه‌دهنده (شامل Traefik محلی، شبیه‌سازی چند Replica و شبکه ایزوله) طراحی شده است:

```yaml
version: '3.8'

services:
  # سرویس Traefik محلی
  traefik:
    image: traefik:v3.0
    container_name: local_traefik
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8081:8080" # داشبورد محلی Traefik
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - app-net

  # پایگاه داده PostgreSQL
  postgres:
    image: postgres:16-alpine
    container_name: local_postgres
    environment:
      POSTGRES_DB: portal_db
      POSTGRES_USER: portal_user
      POSTGRES_PASSWORD: local_secret_password
    volumes:
      - local_pgdata:/var/lib/postgresql/data
    networks:
      - app-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U portal_user -d portal_db"]
      interval: 5s
      timeout: 3s
      retries: 5

  # کانتینر مستقل و یک‌بارمصرف اجرای Migration
  migrate:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["node", "src/config/run-migrations.js"]
    restart: "no"
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: portal_db
      DB_USER: portal_user
      DB_PASSWORD: local_secret_password
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app-net

  # سرویس Backend (مقیاس‌پذیر به چند Replica بدون پورت مستقیم و نام ثابت)
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: development
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: portal_db
      DB_USER: portal_user
      DB_PASSWORD: local_secret_password
      JWT_SECRET: local_jwt_secret_key_1234567890_abcdef
      REFRESH_TOKEN_SECRET: local_refresh_secret_key_1234567890
      SHARED_STORAGE_PATH: /srv/portal/uploads
    volumes:
      - shared_uploads:/srv/portal/uploads
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - app-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=PathPrefix(`/api/`)"
      - "traefik.http.routers.backend.priority=100"
      - "traefik.http.routers.backend.entrypoints=web"
      - "traefik.http.services.backend.loadbalancer.server.port=3000"

  # سرویس Frontend
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      PORT: 8080
      API_BASE_URL: /api/v1
    depends_on:
      - backend
    networks:
      - app-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=PathPrefix(`/`)"
      - "traefik.http.routers.frontend.priority=10"
      - "traefik.http.routers.frontend.entrypoints=web"
      - "traefik.http.services.frontend.loadbalancer.server.port=8080"

volumes:
  local_pgdata:
  shared_uploads:

networks:
  app-net:
    driver: bridge
```

---

### ۲.۳. استک تولید Docker Swarm (`docker-compose.yml`)
این فایل صرفاً از ایمیج‌های GHCR استفاده می‌کند و برای `docker stack deploy` طراحی می‌شود. پیاده‌سازی باید این ویژگی‌ها را داشته باشد:

- سرویس فرانت‌اند با ۳ رپلیکا و سرویس بک‌اند با ۴ رپلیکا؛ PostgreSQL تک‌نسخه و pinned به نود manager.
- استفاده از `deploy.replicas`، `deploy.update_config` با ترتیب `start-first`، `deploy.restart_policy` و `deploy.labels`.
- `update_config` باید `parallelism: 1`، `order: start-first`، `failure_action: rollback` و `monitor` داشته باشد تا هم استقرار اولیه Ansible و هم به‌روزرسانی خودکار عامل `watchtower` به‌صورت rolling و بدون قطعی انجام شود.
- `rollback_config` نیز با همان ترتیب `start-first` تعریف شود تا بازگشت خودکار Swarm در صورت شکست healthcheck امن باشد.
- حذف `container_name`، `depends_on` و `restart`؛ سرویس یک‌بارمصرف `migrate` در استک وجود ندارد و Migration توسط Ansible (و عامل خودکار پیش از به‌روزرسانی بک‌اند) اجرا می‌شود.
- اتصال به دو شبکه overlay خارجی (`app-internal` و `traefik-public`) که Ansible می‌سازد.
- لیبل‌های Traefik زیر `deploy.labels` و سازگار با swarm provider.
- Healthcheck برای هر سه سرویس و اتصال بک‌اند به دیتابیس از طریق نام سرویس استک.
- نگهداری آپلودها روی bind mount میزبان؛ برای استقرار چندنودی باید به shared storage منتقل شود.

---

## ۳. قوانین حیاتی مقیاس‌پذیری چند Replica
1. برای سرویس‌های `backend` و `frontend` هرگز `container_name` یا بخش `ports` (انتشار پورت روی میزبان) قرار نده؛ ورودی عمومی فقط از Traefik است.
2. تعداد رپلیکاها در استک Swarm (۳ فرانت / ۴ بک‌اند) تعیین می‌شود و تغییر آن فقط از طریق Ansible انجام می‌شود.
3. در تست محلی، سیستم باید بدون خطا با ۳ نمونه Backend بالا بیاید و Traefik درخواست‌ها را بین آن‌ها لود بالانس کند:
   ```bash
   docker compose -f docker-compose.local.yml up -d --scale backend=3
   ```

---

## ۴. چک‌لیست اعتبارسنجی گام ۰۸
- [ ] داکرفایل بک‌اند با ساخت چندمرحله‌ای و بدون ابزارهای بیلد اضافه در مرحله Runner ایجاد شده باشد.
- [ ] فایل `docker-compose.local.yml` کلیه سرویس‌ها را با بیلد محلی اجرا کند.
- [ ] Migration توسط Ansible و با ایمیج بک‌اند قبل از roll-out نسخه جدید اجرا شود.
- [ ] مقیاس‌پذیری با `--scale backend=3` تست شده و ترافیک توسط Traefik توزیع شود.
- [ ] فایل `docker-compose.yml` یک استک معتبر Docker Swarm با ۳ رپلیکای فرانت و ۴ رپلیکای بک‌اند، بدون `build:`، `container_name` و `depends_on` باشد.
- [ ] `update_config` و `rollback_config` هر دو rolling و `start-first` باشند تا استقرار اولیه و به‌روزرسانی خودکار بدون قطعی انجام شوند.
