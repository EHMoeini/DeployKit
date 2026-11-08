import { authState } from '../services/auth-state.js';
import { orchestrationAdapter } from '../services/orchestration.service.js';
import { router } from '../router/index.js';

export class AuthGlassView {
    constructor(initialMode = 'login') {
        this.mode = initialMode; // 'login' | 'signup'
        this.container = null;
        this.isLoading = false;
        this.unsubscribeAuth = null;
        this.showPassword = false;
    }

    setMode(mode) {
        if (this.mode === mode) return;
        this.mode = mode;
        this.updateTabUI();
    }

    render() {
        const isAuth = authState.isAuthenticated();
        if (isAuth) {
            return this.renderWelcome();
        }
        return this.renderAuthForm();
    }

    renderAuthForm() {
        const isLogin = this.mode === 'login';
        return `
      <div class="spatial-glass-panel" id="spatial-panel">
        <header class="panel-header">
          <div class="panel-brand-mark">
            <span class="brand-gem"></span>
            <span class="brand-text">PLATFORM ACCESS</span>
          </div>
          <h1 class="panel-title" id="panel-title">${isLogin ? 'ورود به سامانه' : 'ایجاد حساب کاربری'}</h1>
          <p class="panel-subtitle" id="panel-subtitle">${isLogin ? 'برای دسترسی به پنل کاربری مشخصات خود را وارد کنید' : 'یک نام کاربری و رمز عبور برای خود تعریف کنید'}</p>
        </header>

        <div class="spatial-tabs-wrapper" role="tablist">
          <button type="button" role="tab" id="tab-login" class="spatial-tab-btn ${isLogin ? 'is-active' : ''}" aria-selected="${isLogin}">ورود</button>
          <button type="button" role="tab" id="tab-signup" class="spatial-tab-btn ${!isLogin ? 'is-active' : ''}" aria-selected="${!isLogin}">ثبت‌نام</button>
        </div>

        <form class="spatial-form" id="auth-form" novalidate>
          <div class="spatial-field-group">
            <label class="spatial-label" for="auth-username">نام کاربری</label>
            <div class="spatial-input-wrapper">
              <input
                id="auth-username"
                name="username"
                type="text"
                class="spatial-input"
                placeholder="مثلاً: ehsan"
                required
                autocomplete="username"
              />
            </div>
          </div>

          <div class="spatial-field-group">
            <label class="spatial-label" for="auth-password">رمز عبور</label>
            <div class="spatial-input-wrapper">
              <input
                id="auth-password"
                name="password"
                type="${this.showPassword ? 'text' : 'password'}"
                class="spatial-input"
                placeholder="حداقل ۶ کاراکتر"
                required
                autocomplete="${isLogin ? 'current-password' : 'new-password'}"
              />
              <button type="button" class="password-toggle-btn" id="pw-toggle" aria-label="نمایش یا پنهان‌سازی رمز عبور">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  ${this.showPassword
                ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
                : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'
            }
                </svg>
              </button>
            </div>
          </div>

          <div class="spatial-feedback" id="auth-feedback" role="alert"></div>

          <button type="submit" class="spatial-submit-btn" id="auth-submit-btn">
            <span class="btn-text">${isLogin ? 'ورود' : 'ایجاد حساب کاربری'}</span>
          </button>
        </form>
      </div>
    `;
    }

    renderWelcome() {
        const user = authState.getUser() || {};
        const username = user.username || user.display_name || user.email || 'کاربر گرامی';

        return `
      <div class="spatial-glass-panel" id="spatial-panel">
        <div class="welcome-panel-content">
          <header class="panel-header" style="margin-bottom: 1.25rem;">
            <div class="panel-brand-mark">
              <span class="brand-gem"></span>
              <span class="brand-text">ACTIVE SESSION</span>
            </div>
          </header>

          <div class="welcome-header">
            <div class="welcome-meta">
              <h2 class="welcome-greeting-title">خوش آمدید، <span class="welcome-username-highlight">${username}</span></h2>
              <p class="welcome-subtext">نشست کاربری شما فعال است</p>
            </div>
          </div>

          <div class="welcome-actions">
            <button type="button" class="btn-logout-glass" id="logout-btn">خروج</button>
          </div>
        </div>
      </div>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();
        this.bindEvents();

        this.unsubscribeAuth = authState.subscribe(() => {
            if (this.container) {
                this.container.innerHTML = this.render();
                this.bindEvents();
            }
        });
    }

    updateTabUI() {
        if (!this.container) return;
        const isLogin = this.mode === 'login';
        const loginTab = this.container.querySelector('#tab-login');
        const signupTab = this.container.querySelector('#tab-signup');
        const titleEl = this.container.querySelector('#panel-title');
        const subtitleEl = this.container.querySelector('#panel-subtitle');
        const submitBtn = this.container.querySelector('#auth-submit-btn .btn-text');

        if (loginTab && signupTab) {
            loginTab.classList.toggle('is-active', isLogin);
            loginTab.setAttribute('aria-selected', isLogin);
            signupTab.classList.toggle('is-active', !isLogin);
            signupTab.setAttribute('aria-selected', !isLogin);
        }
        if (titleEl) {
            titleEl.textContent = isLogin ? 'ورود به سامانه' : 'ایجاد حساب کاربری';
        }
        if (subtitleEl) {
            subtitleEl.textContent = isLogin ? 'برای دسترسی به پنل کاربری مشخصات خود را وارد کنید' : 'یک نام کاربری و رمز عبور برای خود تعریف کنید';
        }
        if (submitBtn) {
            submitBtn.textContent = isLogin ? 'ورود' : 'ایجاد حساب کاربری';
        }

        // پاکسازی پیام‌های قبلی
        this.hideFeedback();
    }

    bindEvents() {
        if (!this.container) return;

        if (authState.isAuthenticated()) {
            this.bindWelcomeEvents();
            return;
        }

        // سوییچ زبانه‌ها بدون رفرش صفحه
        const loginTab = this.container.querySelector('#tab-login');
        const signupTab = this.container.querySelector('#tab-signup');
        if (loginTab) {
            loginTab.addEventListener('click', () => {
                this.setMode('login');
                window.history.replaceState(null, '', '/login');
            });
        }
        if (signupTab) {
            signupTab.addEventListener('click', () => {
                this.setMode('signup');
                window.history.replaceState(null, '', '/register');
            });
        }

        // دکمه نمایش/عدم‌نمایش پسورد
        const pwToggle = this.container.querySelector('#pw-toggle');
        const pwInput = this.container.querySelector('#auth-password');
        if (pwToggle && pwInput) {
            pwToggle.addEventListener('click', () => {
                this.showPassword = !this.showPassword;
                pwInput.type = this.showPassword ? 'text' : 'password';
            });
        }

        // ارسال فرم احراز هویت
        const form = this.container.querySelector('#auth-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAuthSubmit();
            });
        }
    }

    bindWelcomeEvents() {
        const logoutBtn = this.container.querySelector('#logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await orchestrationAdapter.dispatch('/auth/logout', { method: 'POST' });
                } catch (e) {
                    // در صورت بروز خطا هم سشن کلاینت پاک می‌شود
                } finally {
                    authState.clearAuth();
                    this.setMode('login');
                    window.history.replaceState(null, '', '/login');
                }
            });
        }
    }

    async handleAuthSubmit() {
        if (this.isLoading) return;

        const usernameInput = this.container.querySelector('#auth-username');
        const passwordInput = this.container.querySelector('#auth-password');
        const submitBtn = this.container.querySelector('#auth-submit-btn');

        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';

        if (!username || !password) {
            this.showFeedback('لطفاً نام کاربری و رمز عبور را وارد فرمایید.', true);
            return;
        }

        if (password.length < 6) {
            this.showFeedback('رمز عبور باید حداقل ۶ کاراکتر باشد.', true);
            return;
        }

        this.isLoading = true;
        if (submitBtn) submitBtn.disabled = true;
        this.hideFeedback();

        const endpoint = this.mode === 'login' ? '/auth/login' : '/auth/register';

        try {
            const result = await orchestrationAdapter.dispatch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            });

            if (result.data && result.data.accessToken) {
                authState.setAuth(result.data.accessToken, result.data.user);
                window.history.replaceState(null, '', '/dashboard');
            }
        } catch (err) {
            const msg = err.data && err.data.error ? err.data.error : err.message || 'خطا در احراز هویت';
            this.showFeedback(msg, true);
        } finally {
            this.isLoading = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    showFeedback(message, isError = false) {
        if (!this.container) return;
        const fb = this.container.querySelector('#auth-feedback');
        if (fb) {
            fb.textContent = message;
            fb.className = `spatial-feedback ${isError ? 'is-error' : 'is-success'}`;
            fb.style.display = 'block';
        }
    }

    hideFeedback() {
        if (!this.container) return;
        const fb = this.container.querySelector('#auth-feedback');
        if (fb) {
            fb.textContent = '';
            fb.style.display = 'none';
        }
    }

    unmount() {
        if (this.unsubscribeAuth) {
            this.unsubscribeAuth();
            this.unsubscribeAuth = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
