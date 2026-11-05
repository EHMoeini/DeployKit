# دستورالعمل ۰۸: کانتینرسازی بک‌اند و ساختارهای Docker Compose محلی و سرور

این سند نحوه کانتینرسازی بهینه سرویس Backend، ایجاد فایل `docker-compose.local.yml` برای اجرای تست‌های مقیاس‌پذیری چند Replica به همراه Traefik محلی، و ساخت فایل اصلی `docker-compose.yml` بر پایه ایمیج‌های رجیستری GHCR برای استقرار در سرور را مشخص می‌کند.

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

### ۲.۳. فایل اصلی استقرار سرور (`docker-compose.yml`)
این فایل صرفاً از ایمیج‌های رجیستری GHCR استفاده می‌کند و فاقد بخش `build:` است:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: ${PROJECT_NAME}_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      # مسیر Bind Mount ماندگار دیتابیس روی Host سرور
      - /srv/${PROJECT_NAME}/postgres/data:/var/lib/postgresql/data
    networks:
      - app-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5

  migrate:
    image: ghcr.io/${GHCR_OWNER}/${GHCR_REPO}/backend:${IMAGE_TAG}
    container_name: ${PROJECT_NAME}_migrate
    command: ["node", "src/config/run-migrations.js"]
    restart: "no"
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - app-internal

  backend:
    image: ghcr.io/${GHCR_OWNER}/${GHCR_REPO}/backend:${IMAGE_TAG}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_POOL_MAX: ${DB_POOL_MAX:-10}
      JWT_SECRET: ${JWT_SECRET}
      REFRESH_TOKEN_SECRET: ${REFRESH_TOKEN_SECRET}
      CSRF_SECRET: ${CSRF_SECRET}
      SHARED_STORAGE_PATH: /srv/portal/uploads
    volumes:
      # حجم اشتراکی فایل‌ها روی Host
      - /srv/${PROJECT_NAME}/uploads:/srv/portal/uploads
    depends_on:
      migrate:
        condition: service_completed_successfully
    networks:
      - app-internal
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${PROJECT_NAME}_backend.rule=Host(`${DOMAIN}`) && PathPrefix(`/api/`)"
      - "traefik.http.routers.${PROJECT_NAME}_backend.priority=100"
      - "traefik.http.routers.${PROJECT_NAME}_backend.entrypoints=websecure"
      - "traefik.http.routers.${PROJECT_NAME}_backend.tls=true"
      - "traefik.http.routers.${PROJECT_NAME}_backend.tls.certresolver=letsencrypt"
      - "traefik.http.services.${PROJECT_NAME}_backend.loadbalancer.server.port=3000"

  frontend:
    image: ghcr.io/${GHCR_OWNER}/${GHCR_REPO}/frontend:${IMAGE_TAG}
    container_name: ${PROJECT_NAME}_frontend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 8080
      API_BASE_URL: ${API_BASE_URL:-/api/v1}
      PROJECT_NAME: ${PROJECT_NAME}
    depends_on:
      - backend
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.${PROJECT_NAME}_frontend.rule=Host(`${DOMAIN}`)"
      - "traefik.http.routers.${PROJECT_NAME}_frontend.priority=10"
      - "traefik.http.routers.${PROJECT_NAME}_frontend.entrypoints=websecure"
      - "traefik.http.routers.${PROJECT_NAME}_frontend.tls=true"
      - "traefik.http.routers.${PROJECT_NAME}_frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.${PROJECT_NAME}_frontend.loadbalancer.server.port=8080"

networks:
  app-internal:
    internal: true
  traefik-public:
    external: true
```

---

## ۳. قوانین حیاتی مقیاس‌پذیری چند Replica
1. برای سرویس `backend` هرگز شناسه `container_name` یا بخش `ports` (انتشار پورت روی میزبان) قرار نده.
2. با اجرای دستور زیر در تست محلی، سیستم بدون خطا با ۳ نمونه Backend بالا می‌آید و Traefik درخواست‌ها را بین آن‌ها لود بالانس می‌کند:
   ```bash
   docker compose -f docker-compose.local.yml up -d --scale backend=3
   ```

---

## ۴. چک‌لیست اعتبارسنجی گام ۰۸
- [ ] داکرفایل بک‌اند با ساخت چندمرحله‌ای و بدون ابزارهای بیلد اضافه در مرحله Runner ایجاد شده باشد.
- [ ] فایل `docker-compose.local.yml` کلیه سرویس‌ها را با بیلد محلی اجرا کند.
- [ ] فرآیند Migration توسط کانتینر `migrate` به صورت یک‌باره انجام شده و قبل از اجرای `backend` با موفقیت پایان یابد.
- [ ] مقیاس‌پذیری با `--scale backend=3` تست شده و ترافیک توسط Traefik توزیع شود.
- [ ] فایل `docker-compose.yml` فاقد دستور `build:` بوده و آماده دریافت ایمیج‌های GHCR باشد.
