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
