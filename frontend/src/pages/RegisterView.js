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
