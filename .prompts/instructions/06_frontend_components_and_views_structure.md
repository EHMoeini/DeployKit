# دستورالعمل ۰۶: ساختار کامپوننت‌ها، ویوها و چرخه حیات کلاینت SPA

این سند ساختار معماری کلاینت سمت کاربر (SPA)، تفکیک وظایف کامپوننت‌ها، ساختار فرم‌ها، کنترل‌کننده‌های رویداد و الگوی استاندارد چرخه حیات (`mount` و `unmount`) را جهت جلوگیری از نشت حافظه تشریح می‌کند. این راهنما منحصراً بر **ساختار، سلسله‌مراتب المان‌ها و منطق تعاملی** تمرکز داشته و از هرگونه جزئیات یا قیدهای طراحی ظاهری، تم‌های رنگی یا استایل‌های تزئینی خالی است.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `05`.
- سیستم Router، مدیریت وضعیت احراز هویت (`AuthState`) و کلاینت HTTP (`apiRequest`) در دسترس باشند.

---

## ۲. معماری ساختاری فرانت‌اند (Component & View Hierarchy)

سلسله‌مراتب ساختاری اجزای فرانت‌اند به صورت زیر سازمان‌دهی می‌شود:

```text
frontend/src/
├── main.js                  # نقطه ورود اصلی برنامه و راه‌اندازی روتر
├── App.js                   # اسکلت و چیدمان سراسری ریشه (Header, Main Outlet, Footer)
├── pages/                   # ویوهای متناظر با مسیرهای روتر
│   ├── LoginView.js         # ساختار فرم ورود و مدیریت خطاهای اعتبارسنجی
│   ├── RegisterView.js      # ساختار فرم ثبت‌نام و دریافت فیلدهای کاربری
│   ├── DashboardView.js     # ساختار پنل کاربری، آپلود فایل و اکشن‌های تعاملی
│   └── NotFoundView.js      # ساختار صفحه خطای ۴۰۴ مسیرهای سمت کلاینت
└── styles/
    └── layout.css           # استایل‌های صرفاً ساختاری (Grid/Flexbox/Reset بدون طراحی ظاهری)
```

---

## ۳. الگوی چرخه حیات کامپوننت‌ها (Lifecycle Pattern)

برای اطمینان از عملکرد بدون مشکل در یک برنامه تک‌صفحه‌ای با اجرای طولانی‌مدت (Long-running SPA)، هر ویو باید از الگوی استاندارد زیر پیروی کند:

1. **`render()`:** تولید ساختار درخت DOM (HTML String یا Elements).
2. **`mount(container)`:** الحاق ساختار به والد، اتصال شنوندگان رویداد (Event Listeners) و اشتراک در رخدادها.
3. **`unmount()`:** لغو اشتراک‌ها، حذف شنوندگان رویداد و پاک‌سازی حافظه برای جلوگیری از نشت رویدادها (Memory Leaks).

---

## ۴. گام‌های اجرایی

### ۴.۱. کامپوننت ساختاری ریشه (`frontend/src/App.js`)
این ماژول ساختار اسکلت عمومی صفحه (Layout Shell) شامل نوار ناوبری، محل نمایش ویوی پویا (`#router-outlet`) و فوتر را فراهم می‌سازد:

```javascript
import { authState } from './services/auth-state.js';
import { router } from './router/index.js';

export class App {
  constructor() {
    this.container = null;
    this.unsubscribeAuth = null;
  }

  render() {
    return `
      <div class="app-layout">
        <header class="app-header">
          <div class="header-brand">
            <span id="app-title">User Portal</span>
          </div>
          <nav class="header-nav" id="header-nav">
            <!-- لینک‌های ناوبری به صورت ساختاری بر اساس وضعیت احراز هویت -->
          </nav>
        </header>

        <main class="app-main" id="router-outlet">
          <!-- محل تزریق ساختار ویوی فعال توسط روتر -->
        </main>

        <footer class="app-footer">
          <p id="app-footer-text">&copy; Application Portal. All rights reserved.</p>
        </footer>
      </div>
    `;
  }

  mount(container) {
    this.container = container;
    this.container.innerHTML = this.render();

    this.navElement = this.container.querySelector('#header-nav');

    // اشتراک در تغییرات وضعیت لاگین جهت به‌روزرسانی منوی ناوبری
    this.unsubscribeAuth = authState.subscribe(() => {
      this.updateNavigation();
    });

    this.updateNavigation();
  }

  updateNavigation() {
    if (!this.navElement) return;

    const isAuth = authState.isAuthenticated();
    if (isAuth) {
      const user = authState.getUser() || {};
      this.navElement.innerHTML = `
        <span class="user-greeting">کاربر: ${user.display_name || user.email || ''}</span>
        <a href="/dashboard" data-link class="nav-link">داشبورد</a>
        <button id="nav-logout-btn" type="button" class="btn-action">خروج</button>
      `;

      const logoutBtn = this.navElement.querySelector('#nav-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          try {
            await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
          } finally {
            authState.clearAuth();
            router.navigate('/login');
          }
        });
      }
    } else {
      this.navElement.innerHTML = `
        <a href="/login" data-link class="nav-link">ورود</a>
        <a href="/register" data-link class="nav-link">ثبت‌نام</a>
      `;
    }

    // هدایت کلیک‌های لینک به روتر کلاینت
    this.navElement.querySelectorAll('[data-link]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        router.navigate(link.getAttribute('href'));
      });
    });
  }

  unmount() {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
```

---

### ۴.۲. نقطه ورود اصلی کلاینت (`frontend/src/main.js`)
اتصال اسکلت ریشه به DOM و پیوند روتر با چرخه حیات ویوها:

```javascript
import { App } from './App.js';
import { router } from './router/index.js';
import { authState } from './services/auth-state.js';
import { apiRequest } from './services/api-client.js';

import { LoginView } from './pages/LoginView.js';
import { RegisterView } from './pages/RegisterView.js';
import { DashboardView } from './pages/DashboardView.js';
import { NotFoundView } from './pages/NotFoundView.js';

const viewMap = {
  LoginView,
  RegisterView,
  DashboardView,
  NotFoundView,
};

let currentViewInstance = null;

async function bootstrap() {
  const rootElement = document.getElementById('app');
  if (!rootElement) return;

  const appLayout = new App();
  appLayout.mount(rootElement);

  const outlet = document.getElementById('router-outlet');

  // تلاش برای بازیابی سشن اولیه در RAM از طریق کوکی Refresh Token
  try {
    const res = await apiRequest('/auth/refresh', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      authState.setAuth(data.accessToken, data.user);
    }
  } catch {
    // در صورت نبود سشن، وضعیت مهمان حفظ می‌شود
  }

  // ثبت هندلر روتر برای سوئیچ ساختار ویوها با مدیریت کامل چرخه حیات
  router.init((componentName, path) => {
    if (currentViewInstance && typeof currentViewInstance.unmount === 'function') {
      currentViewInstance.unmount();
    }

    const ViewClass = viewMap[componentName] || NotFoundView;
    currentViewInstance = new ViewClass();

    if (outlet) {
      outlet.innerHTML = '';
      currentViewInstance.mount(outlet);
    }
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
```

---

### ۴.۳. ساختار فرم ورود (`frontend/src/pages/LoginView.js`)
یک ویوی ساختاریافته شامل فیلدهای ورودی فرم، مدیریت اعتبارسنجی و لایف‌سایکل:

```javascript
import { apiRequest } from '../services/api-client.js';
import { authState } from '../services/auth-state.js';
import { router } from '../router/index.js';

export class LoginView {
  constructor() {
    this.container = null;
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  render() {
    return `
      <section class="view-container auth-view">
        <header class="view-header">
          <h2>ورود به حساب کاربری</h2>
        </header>

        <form id="login-form" class="form-layout" novalidate>
          <div class="form-group">
            <label for="login-email">پست الکترونیک:</label>
            <input type="email" id="login-email" name="email" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label for="login-password">کلمه عبور:</label>
            <input type="password" id="login-password" name="password" required autocomplete="current-password" />
          </div>

          <div id="login-error" class="status-message error-message is-hidden" role="alert"></div>

          <div class="form-actions">
            <button type="submit" id="login-submit-btn" class="btn-primary">ورود</button>
          </div>
        </form>

        <footer class="view-footer">
          <span>حساب کاربری ندارید؟</span>
          <a href="/register" id="link-to-register" class="text-link">ثبت‌نام کنید</a>
        </footer>
      </section>
    `;
  }

  mount(container) {
    this.container = container;
    this.container.innerHTML = this.render();

    this.form = this.container.querySelector('#login-form');
    this.errorBox = this.container.querySelector('#login-error');
    this.registerLink = this.container.querySelector('#link-to-register');

    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit);
    }

    if (this.registerLink) {
      this.registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        router.navigate('/register');
      });
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.clearError();

    const formData = new FormData(this.form);
    const email = formData.get('email')?.trim();
    const password = formData.get('password');

    if (!email || !password) {
      this.showError('لطفاً ایمیل و کلمه عبور را وارد کنید.');
      return;
    }

    try {
      const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'خطا در احراز هویت');
      }

      authState.setAuth(data.accessToken, data.user);
      router.navigate('/dashboard');
    } catch (err) {
      this.showError(err.message);
    }
  }

  showError(message) {
    if (this.errorBox) {
      this.errorBox.textContent = message;
      this.errorBox.classList.remove('is-hidden');
    }
  }

  clearError() {
    if (this.errorBox) {
      this.errorBox.textContent = '';
      this.errorBox.classList.add('is-hidden');
    }
  }

  unmount() {
    if (this.form) {
      this.form.removeEventListener('submit', this.handleSubmit);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
```

---

### ۴.۴. ساختار فرم ثبت‌نام (`frontend/src/pages/RegisterView.js`)
ساختار ثبت‌نام با فیلدهای مشخص، اعتبارسنجی و ارسال داده:

```javascript
import { apiRequest } from '../services/api-client.js';
import { authState } from '../services/auth-state.js';
import { router } from '../router/index.js';

export class RegisterView {
  constructor() {
    this.container = null;
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  render() {
    return `
      <section class="view-container auth-view">
        <header class="view-header">
          <h2>ایجاد حساب کاربری جدید</h2>
        </header>

        <form id="register-form" class="form-layout" novalidate>
          <div class="form-group">
            <label for="reg-name">نام نمایشی:</label>
            <input type="text" id="reg-name" name="displayName" required minlength="2" />
          </div>

          <div class="form-group">
            <label for="reg-email">پست الکترونیک:</label>
            <input type="email" id="reg-email" name="email" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label for="reg-password">کلمه عبور (حداقل ۸ کاراکتر):</label>
            <input type="password" id="reg-password" name="password" required minlength="8" />
          </div>

          <div id="register-error" class="status-message error-message is-hidden" role="alert"></div>

          <div class="form-actions">
            <button type="submit" id="register-submit-btn" class="btn-primary">ثبت‌نام</button>
          </div>
        </form>

        <footer class="view-footer">
          <span>قبلاً ثبت‌نام کرده‌اید؟</span>
          <a href="/login" id="link-to-login" class="text-link">وارد شوید</a>
        </footer>
      </section>
    `;
  }

  mount(container) {
    this.container = container;
    this.container.innerHTML = this.render();

    this.form = this.container.querySelector('#register-form');
    this.errorBox = this.container.querySelector('#register-error');
    this.loginLink = this.container.querySelector('#link-to-login');

    if (this.form) {
      this.form.addEventListener('submit', this.handleSubmit);
    }

    if (this.loginLink) {
      this.loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        router.navigate('/login');
      });
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.clearError();

    const formData = new FormData(this.form);
    const displayName = formData.get('displayName')?.trim();
    const email = formData.get('email')?.trim();
    const password = formData.get('password');

    if (!displayName || !email || !password) {
      this.showError('تکمیل تمامی فیلدها الزامی است.');
      return;
    }

    if (password.length < 8) {
      this.showError('طول کلمه عبور باید حداقل ۸ کاراکتر باشد.');
      return;
    }

    try {
      const response = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'خطا در انجام ثبت‌نام');
      }

      authState.setAuth(data.accessToken, data.user);
      router.navigate('/dashboard');
    } catch (err) {
      this.showError(err.message);
    }
  }

  showError(message) {
    if (this.errorBox) {
      this.errorBox.textContent = message;
      this.errorBox.classList.remove('is-hidden');
    }
  }

  clearError() {
    if (this.errorBox) {
      this.errorBox.textContent = '';
      this.errorBox.classList.add('is-hidden');
    }
  }

  unmount() {
    if (this.form) {
      this.form.removeEventListener('submit', this.handleSubmit);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
```

---

### ۴.۵. ساختار داشبورد و کنترل عملیات کاربر (`frontend/src/pages/DashboardView.js`)
ساختار پنل کاربری شامل ۴ بخش اصلی: مشخصات کاربر، فرم آپلود تصویر آواتار، دکمه اکشن (ثبت رویداد کاربری) و دکمه خروج:

```javascript
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
      if (img && data.file && data.file.id) {
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
```

---

### ۴.۶. ساختار صفحه خطای کلاینت (`frontend/src/pages/NotFoundView.js`)
```javascript
import { router } from '../router/index.js';

export class NotFoundView {
  constructor() {
    this.container = null;
    this.handleBackClick = this.handleBackClick.bind(this);
  }

  render() {
    return `
      <section class="view-container not-found-view">
        <header class="view-header">
          <h2>۴۰۴ - صفحه مورد نظر یافت نشد</h2>
        </header>
        <p class="view-description">مسیری که درخواست کرده‌اید در برنامه سمت کلاینت تعریف نشده است.</p>
        <div class="view-actions">
          <button type="button" id="back-home-btn" class="btn-primary">بازگشت به صفحه اصلی</button>
        </div>
      </section>
    `;
  }

  mount(container) {
    this.container = container;
    this.container.innerHTML = this.render();

    this.backBtn = this.container.querySelector('#back-home-btn');
    if (this.backBtn) {
      this.backBtn.addEventListener('click', this.handleBackClick);
    }
  }

  handleBackClick() {
    router.navigate('/');
  }

  unmount() {
    if (this.backBtn) {
      this.backBtn.removeEventListener('click', this.handleBackClick);
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
```

---

### ۴.۷. استایل‌های صرفاً ساختاری (`frontend/src/styles/layout.css`)
این استایل‌ها فقط چارچوب‌بندی فیزیکی و ساختاری صفحات (چیدمان جعبه‌ها، فاصله‌گذاری‌ها، Flexbox/Grid و مخفی‌سازی) را مشخص می‌کنند و هیچ‌گونه طراحی ظاهری، رنگ‌های تزئینی یا سایه ندارند:

```css
/* ریست ساختاری ابعاد المان‌ها */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* چارچوب ساختاری سراسری صفحه */
html, body {
  height: 100%;
  width: 100%;
  font-family: system-ui, -apple-system, sans-serif;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
}

.header-nav {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.app-main {
  flex: 1 0 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem 1rem;
}

.app-footer {
  flex-shrink: 0;
  text-align: center;
  padding: 1rem;
}

/* ساختار کانتینر ویوها */
.view-container {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.auth-view {
  max-width: 420px;
}

/* ساختار فرم‌ها و فیلدها */
.form-layout {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group input {
  padding: 0.6rem 0.8rem;
  font-size: 1rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

/* ساختار کارت‌های داشبورد */
.dashboard-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
}

/* کلاس‌های وضعیت ساختاری */
.is-hidden {
  display: none !important;
}

.status-message {
  padding: 0.5rem;
  font-size: 0.9rem;
}
```

---

## ۵. چک‌لیست اعتبارسنجی گام ۰۶
- [ ] ساختار کلیه فایل‌ها در `frontend/src/` (شامل `App.js`, `main.js`, `pages/` و `styles/layout.css`) پیاده‌سازی شده باشد.
- [ ] هر کامپوننت متدهای استاندارد `mount` و `unmount` را برای جلوگیری از نشت رویدادها پیاده‌سازی کرده باشد.
- [ ] فرم‌های Login و Register ساختار اعتبارسنجی ورودی‌ها و نمایش پیام خطا را داشته باشند.
- [ ] ویوی داشبورد قابلیت اتصال به روت‌های آپلود فایل و ثبت رخداد را در ساختار خود داشته باشد.
- [ ] استایل‌ها منحصراً ساختاری بوده و فاقد هرگونه تزیینات، تم‌ها و متغیرهای بصری غیرضروری باشند.
