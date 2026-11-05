# دستورالعمل ۰۵: مسیریابی فرانت‌اند SPA، پیکربندی زمان اجرا و اینترسپتور احراز هویت

این سند پیاده‌سازی مسیریابی سمت کلاینت (True SPA بدون SSR)، پیکربندی متغیرهای محیطی در زمان اجرای کانتینر (`/config.js`)، مدیریت امن وضعیت احراز هویت در حافظه و ساخت کلاینت HTTP با صف تک‌پروازی (Single-Flight Promise Queue) جهت نوسازی توکن را شرح می‌دهد.

---

## ۱. پیش‌نیازها
- اجرای کامل مراحل `01` تا `04`.
- پکیج فرانت‌اند در `frontend/package.json` نصب و آماده شده باشد.

---

## ۲. گام‌های اجرایی

### ۲.۱. پیکربندی زمان اجرا (Runtime Configuration)
برای آن‌که یک ایمیج ساخته‌شده در داکر بتواند بدون نیاز به بیلد مجدد در محیط‌های مختلف (لوکال، Staging و Production) کار کند، آدرس API نباید درون کدهای باندل‌شده Hardcode شود.

#### ۱. فایل پیش‌فرض محلی (`frontend/public/config.js`)
```javascript
window.__APP_CONFIG__ = {
  API_BASE_URL: '/api/v1',
  PROJECT_NAME: 'User Portal',
};
```

#### ۲. ارجاع در `frontend/index.html`
در بخش `<head>` فایل `index.html` قبل از لود شدن اسکریپت‌های باندل، اسکریپت کانفیگ را فراخوانی کن:
```html
<!DOCTYPE html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>پورتال کاربری (User Portal SPA)</title>
    <!-- لود کانفیگ داینامیک پیش از شروع برنامه -->
    <script src="/config.js"></script>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

---

### ۲.۲. مدیریت وضعیت احراز هویت در حافظه (`frontend/src/services/auth-state.js`)
طبق قوانین امنیت، JWT Access Token صرفاً باید در RAM نگهداری شود و نباید در `localStorage` یا `sessionStorage` نوشته شود:

```javascript
class AuthState {
  constructor() {
    this.accessToken = null;
    this.currentUser = null;
    this.listeners = new Set();
  }

  getAccessToken() {
    return this.accessToken;
  }

  setAuth(accessToken, user) {
    this.accessToken = accessToken;
    this.currentUser = user;
    this.notify();
  }

  clearAuth() {
    this.accessToken = null;
    this.currentUser = null;
    this.notify();
  }

  getUser() {
    return this.currentUser;
  }

  isAuthenticated() {
    return Boolean(this.accessToken);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.currentUser));
  }
}

export const authState = new AuthState();
```

---

### ۲.۳. کلاینت HTTP و صف تک‌پروازی نوسازی توکن (`frontend/src/services/api-client.js`)
برای جلوگیری از ارسال هم‌زمان چند درخواست Refresh هنگام دریافت خطای 401، از الگوی Single-Flight استفاده کن:

```javascript
import { authState } from './auth-state.js';

const getBaseUrl = () => {
  return (window.__APP_CONFIG__ && window.__APP_CONFIG__.API_BASE_URL) || '/api/v1';
};

// خواندن کوکی CSRF برای ارسال در هدر
const getCsrfToken = () => {
  const match = document.cookie.match(/(^|;)\s*csrf_token\s*=\s*([^;]+)/);
  return match ? decodeURIComponent(match[2]) : '';
};

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export async function apiRequest(endpoint, options = {}) {
  const url = `${getBaseUrl()}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  // اضافه کردن Bearer Token
  const token = authState.getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // اضافه کردن هدر CSRF برای متدهای تغییردهنده
  if (!['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET')) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }

  const config = {
    ...options,
    headers,
    credentials: 'include', // ارسال و دریافت کوکی‌های HttpOnly
  };

  let response = await fetch(url, config);

  // در صورت انقضای توکن (401)، نوسازی تک‌پروازی (Single-Flight) را اجرا کن
  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    if (isRefreshing) {
      // درخواست‌های موازی منتظر نتیجه درخواست اول می‌مانند
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newToken) => {
        headers['Authorization'] = `Bearer ${newToken}`;
        return fetch(url, { ...config, headers });
      });
    }

    isRefreshing = true;

    try {
      const refreshResponse = await fetch(`${getBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        credentials: 'include',
      });

      if (!refreshResponse.ok) {
        throw new Error('REFRESH_FAILED');
      }

      const refreshData = await refreshResponse.json();
      authState.setAuth(refreshData.accessToken, refreshData.user);

      processQueue(null, refreshData.accessToken);

      // اجرای مجدد درخواست اصلی
      headers['Authorization'] = `Bearer ${refreshData.accessToken}`;
      return fetch(url, { ...config, headers });
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      authState.clearAuth();
      window.dispatchEvent(new CustomEvent('app:unauthorized'));
      throw refreshErr;
    } finally {
      isRefreshing = false;
    }
  }

  return response;
}
```

---

### ۲.۴. معماری Client-Side SPA Router (`frontend/src/router/index.js`)
یک روتر سبک مبتنی بر HTML5 History API پیاده‌سازی کن که بدون نیاز به Full Page Reload، صفحات را مدیریت کند:

```javascript
import { authState } from '../services/auth-state.js';

export const routes = {
  '/': { redirect: '/dashboard' },
  '/login': { component: 'LoginView', guestOnly: true },
  '/register': { component: 'RegisterView', guestOnly: true },
  '/dashboard': { component: 'DashboardView', requiresAuth: true },
  '/404': { component: 'NotFoundView' },
};

class Router {
  constructor() {
    this.currentPath = window.location.pathname;
    this.routeHandler = null;

    window.addEventListener('popstate', () => {
      this.navigate(window.location.pathname, false);
    });

    window.addEventListener('app:unauthorized', () => {
      this.navigate('/login', true);
    });
  }

  init(handler) {
    this.routeHandler = handler;
    this.navigate(window.location.pathname, false);
  }

  navigate(path, push = true) {
    let target = path;

    // بررسی ریدایرکت ریشه
    if (target === '/') {
      target = authState.isAuthenticated() ? '/dashboard' : '/login';
    }

    const route = routes[target] || routes['/404'];

    // گارد محافظت‌شده
    if (route.requiresAuth && !authState.isAuthenticated()) {
      target = '/login';
    }

    // گارد مهمان
    if (route.guestOnly && authState.isAuthenticated()) {
      target = '/dashboard';
    }

    if (push && window.location.pathname !== target) {
      window.history.pushState({}, '', target);
    }

    this.currentPath = target;
    const resolvedRoute = routes[target] || routes['/404'];

    if (this.routeHandler) {
      this.routeHandler(resolvedRoute.component, target);
    }
  }
}

export const router = new Router();
```

---

## ۳. چک‌لیست اعتبارسنجی گام ۰۵
- [ ] فایل `/config.js` به صورت مستقل در دسترس مرورگر قرار داشته باشد.
- [ ] توکن JWT فقط در متغیر حافظه (`AuthState`) ذخیره شود و هیچ اثری از آن در Storage محلی نباشد.
- [ ] در صورت وقوع خطای ۴۰۱، فقط یک درخواست نوسازی ارسال شود و سایر درخواست‌ها صف‌بندی گردند.
- [ ] کلیدهای Back و Forward مرورگر بدون Full Page Reload کار کنند.
- [ ] ورود به مسیر ناموجود، کامپوننت `NotFoundView` را در سمت کلاینت فراخوانی کند.
