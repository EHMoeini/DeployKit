import { apiRequest } from '../services/api-client.js';
import { authState } from '../services/auth-state.js';
import { router } from '../router/index.js';

export class DashboardView {
    constructor() {
        this.container = null;
        this.handleAvatarUpload = this.handleAvatarUpload.bind(this);
        this.handleActionEvent = this.handleActionEvent.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
    }

    render() {
        const user = authState.getUser() || {};

        return `
      <section class="view-container dashboard-view">
        <header class="view-header">
          <h2>داشبورد کاربری</h2>
        </header>

        <!-- بخش ۱: اطلاعات هویتی کاربر -->
        <article class="dashboard-card" id="user-profile-section">
          <h3>مشخصات کاربر</h3>
          <div class="user-details">
            <p><strong>شناسه کاربری:</strong> <span id="user-id">${user.id || '-'}</span></p>
            <p><strong>پست الکترونیک:</strong> <span id="user-email">${user.email || '-'}</span></p>
            <p><strong>نام نمایشی:</strong> <span id="user-display-name">${user.display_name || '-'}</span></p>
            <p><strong>شمارنده اقدامات:</strong> <span id="action-counter">${user.shatter_count || 0}</span></p>
          </div>
        </article>

        <!-- بخش ۲: مدیریت آواتار و فایل -->
        <article class="dashboard-card" id="avatar-section">
          <h3>تصویر پروفایل</h3>
          <div class="avatar-display">
            <img id="avatar-image"
                 src="${user.avatar_url ? `/api/v1/files/${user.avatar_url}` : '/assets/default-avatar.svg'}"
                 alt="تصویر کاربر"
                 width="120"
                 height="120" />
          </div>
          <form id="avatar-form" class="form-layout">
            <div class="form-group">
              <label for="avatar-file-input">انتخاب تصویر جدید (حداکثر ۵ مگابایت):</label>
              <input type="file" id="avatar-file-input" name="avatar" accept="image/png,image/jpeg,image/webp" required />
            </div>
            <div class="form-actions">
              <button type="submit" id="avatar-upload-btn" class="btn-secondary">آپلود تصویر</button>
            </div>
            <div id="avatar-status" class="status-message is-hidden"></div>
          </form>
        </article>

        <!-- بخش ۳: دکمه اقدام تعاملی (User Action Trigger) -->
        <article class="dashboard-card" id="actions-section">
          <h3>عملیات کاربر</h3>
          <p>با کلیک بر روی دکمه زیر، یک درخواست ثبت رخداد به سرور ارسال شده و شمارنده دیتابیس افزایش می‌یابد.</p>
          <div class="action-buttons">
            <button type="button" id="trigger-action-btn" class="btn-primary">ثبت رخداد تعاملی</button>
          </div>
          <div id="action-status" class="status-message is-hidden"></div>
        </article>

        <!-- بخش ۴: عملیات نشست و خروج -->
        <footer class="dashboard-footer">
          <button type="button" id="dashboard-logout-btn" class="btn-danger">خروج از حساب</button>
        </footer>
      </section>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();

        this.avatarForm = this.container.querySelector('#avatar-form');
        this.avatarStatus = this.container.querySelector('#avatar-status');
        this.actionBtn = this.container.querySelector('#trigger-action-btn');
        this.actionStatus = this.container.querySelector('#action-status');
        this.logoutBtn = this.container.querySelector('#dashboard-logout-btn');

        if (this.avatarForm) {
            this.avatarForm.addEventListener('submit', this.handleAvatarUpload);
        }
        if (this.actionBtn) {
            this.actionBtn.addEventListener('click', this.handleActionEvent);
        }
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', this.handleLogout);
        }
    }

    async handleAvatarUpload(event) {
        event.preventDefault();
        const fileInput = this.container.querySelector('#avatar-file-input');
        if (!fileInput || !fileInput.files.length) return;

        const file = fileInput.files[0];
        const formData = new FormData();
        formData.append('avatar', file);

        this.setAvatarStatus('در حال آپلود...', 'info');

        try {
            const response = await apiRequest('/user/avatar', {
                method: 'POST',
                headers: {}, // عدم تنظیم Content-Type دستی تا مرورگر boundary مناسب را تعیین کند
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'خطا در آپلود آواتار');
            }

            this.setAvatarStatus('تصویر با موفقیت بروز شد.', 'success');

            // بروزرسانی تصویر در DOM
            const img = this.container.querySelector('#avatar-image');
            if (img && data.file && data.file.stored_filename) {
                img.src = `/api/v1/files/${data.file.stored_filename}?t=${Date.now()}`;
            }
        } catch (err) {
            this.setAvatarStatus(err.message, 'error');
        }
    }

    async handleActionEvent() {
        this.setActionButtonStatus('در حال ارسال درخواست...', 'info');

        try {
            const response = await apiRequest('/user/shatter', {
                method: 'POST',
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'خطا در ثبت رویداد');
            }

            const counterSpan = this.container.querySelector('#action-counter');
            if (counterSpan && data.shatter_count !== undefined) {
                counterSpan.textContent = data.shatter_count;
            }

            this.setActionButtonStatus(`رخداد با موفقیت ثبت شد (مجموع: ${data.shatter_count}).`, 'success');
        } catch (err) {
            this.setActionButtonStatus(err.message, 'error');
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
        } finally {
            authState.clearAuth();
            router.navigate('/login');
        }
    }

    setAvatarStatus(msg, type) {
        if (!this.avatarStatus) return;
        this.avatarStatus.textContent = msg;
        this.avatarStatus.className = `status-message status-${type}`;
    }

    setActionButtonStatus(msg, type) {
        if (!this.actionStatus) return;
        this.actionStatus.textContent = msg;
        this.actionStatus.className = `status-message status-${type}`;
    }

    unmount() {
        if (this.avatarForm) {
            this.avatarForm.removeEventListener('submit', this.handleAvatarUpload);
        }
        if (this.actionBtn) {
            this.actionBtn.removeEventListener('click', this.handleActionEvent);
        }
        if (this.logoutBtn) {
            this.logoutBtn.removeEventListener('click', this.handleLogout);
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
