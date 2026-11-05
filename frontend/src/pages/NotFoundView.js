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
