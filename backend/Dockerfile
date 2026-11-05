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
