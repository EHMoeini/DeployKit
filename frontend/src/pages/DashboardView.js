import { authState } from '../services/auth-state.js';
import { router } from '../router/index.js';

export class DashboardView {
    constructor() {
        this.container = null;
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
          </div>
        </article>

        <!-- بخش ۲: عملیات نشست و خروج -->
        <footer class="dashboard-footer">
          <button type="button" id="dashboard-logout-btn" class="btn-danger">خروج از حساب</button>
        </footer>
      </section>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();

        this.logoutBtn = this.container.querySelector('#dashboard-logout-btn');

        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', this.handleLogout);
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

    unmount() {
        if (this.logoutBtn) {
            this.logoutBtn.removeEventListener('click', this.handleLogout);
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
