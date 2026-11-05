# ==============================================================================
# Stage 1: Build Stage
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# نصب پکیج‌ها با تفکیک لایه‌ها جهت کش بهینه
COPY package.json package-lock.json* ./
RUN npm ci

# کپی کد منبع و بیلد SPA
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Minimal Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# کپی خروجی بیلد و سرور استاتیک
COPY --from=builder /app/dist ./dist
COPY server.js ./
COPY entrypoint.sh ./

# اعطای دسترسی‌های لازم به کاربر غیر روت (node)
RUN chmod +x ./entrypoint.sh && \
    chown -R node:node /app

# جابه‌جایی به کاربر غیر روت
USER node

EXPOSE 8080

# بررسی سلامت کانتینر
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health/live || exit 1

ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
