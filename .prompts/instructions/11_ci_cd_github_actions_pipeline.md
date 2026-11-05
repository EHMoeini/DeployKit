# دستورالعمل ۱۱: پایپ‌لاین CI/CD در GitHub Actions و انتشار ایمیج‌ها در GHCR

این سند پیکربندی Workflow ساخت خودکار، بهینه‌سازی فرآیند بیلد با کش لایه‌ها، تگ‌گذاری با تگ‌های تغییرناپذیر `<short-sha>` و انتشار ایمیج‌های کانتینری در GitHub Container Registry (GHCR) را تشریح می‌کند.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `10`.
- داکرفایل‌های `frontend/Dockerfile` و `backend/Dockerfile` تست شده و آماده باشند.
- حساب کاربری GitHub با دسترسی نوشتن در پکیج‌ها (GHCR).

---

## ۲. گام‌های اجرایی

### ۲.۱. فایل پایپ‌لاین CI/CD (`.github/workflows/docker-publish.yml`)
یک پایپ‌لاین بهینه با استفاده از اکشن‌های رسمی داکر و کش GitHub Actions بساز:

```yaml
name: Build and Publish Multi-Architecture Docker Images to GHCR

on:
  push:
    branches:
      - main
    paths:
      - 'backend/**'
      - 'frontend/**'
      - '.github/workflows/docker-publish.yml'
  workflow_dispatch:
    inputs:
      tag:
        description: 'Manual image tag (optional)'
        required: false
        default: ''

env:
  REGISTRY: ghcr.io
  IMAGE_NAME_BACKEND: ${{ github.repository }}/backend
  IMAGE_NAME_FRONTEND: ${{ github.repository }}/frontend

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags, labels) for Backend
        id: meta-backend
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_BACKEND }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,format=short,prefix=
            type=raw,value=${{ github.event.inputs.tag }},enable=${{ github.event.inputs.tag != '' }}

      - name: Extract metadata (tags, labels) for Frontend
        id: meta-frontend
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME_FRONTEND }}
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=sha,format=short,prefix=
            type=raw,value=${{ github.event.inputs.tag }},enable=${{ github.event.inputs.tag != '' }}

      # بیلد و انتشار ایمیج Backend
      - name: Build and push Backend Image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: ${{ steps.meta-backend.outputs.tags }}
          labels: ${{ steps.meta-backend.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # بیلد و انتشار ایمیج Frontend
      - name: Build and push Frontend Image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/Dockerfile
          push: true
          tags: ${{ steps.meta-frontend.outputs.tags }}
          labels: ${{ steps.meta-frontend.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Summary of Published Images
        run: |
          echo "### 🚀 Published Images to GHCR" >> $GITHUB_STEP_SUMMARY
          echo "- **Backend:** \`${{ env.REGISTRY }}/${{ env.IMAGE_NAME_BACKEND }}:${{ steps.meta-backend.outputs.version }}\`" >> $GITHUB_STEP_SUMMARY
          echo "- **Frontend:** \`${{ env.REGISTRY }}/${{ env.IMAGE_NAME_FRONTEND }}:${{ steps.meta-frontend.outputs.version }}\`" >> $GITHUB_STEP_SUMMARY
```

---

### ۲.۲. استانداردهای نام‌گذاری و تگ‌های تغییرناپذیر (Immutable Tags)
- **قانون تغییرناپذیری:** استقرار در سرور Production توسط Ansible همیشه باید با تگ کوتاه کامیت Git (مثلاً `a1b2c3d`) انجام شود، نه با تگ متغیر `latest`.
- تگ `latest` صرفاً برای اهداف رفرنس عمومی نگه داشته می‌شود.
- این الگو تضمین می‌کند که بازگشت به عقب (Rollback) در صورت بروز مشکل همیشه دقیقاً به همان بیلد کامیت قبلی متصل شود.

---

## ۳. چک‌لیست اعتبارسنجی گام ۱۱
- [ ] پایپ‌لاین فاقد نیاز به Personal Access Token (PAT) دستی بوده و از `GITHUB_TOKEN` با دسترسی `packages: write` استفاده کند.
- [ ] ساخت ایمیج‌ها با کش سریع `type=gha` پیکربندی شده باشد.
- [ ] هر دو ایمیج Backend و Frontend به همراه تگ `<short-sha>` و `latest` به درستی تولید و تگ‌گذاری شوند.
- [ ] مسیر فایل Workflow در `.github/workflows/docker-publish.yml` قرار داشته باشد.
