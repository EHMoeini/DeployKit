import './styles/layout.css';
import './styles/spatial-glass.css';
import { App } from './App.js';
import { router } from './router/index.js';
import { authState } from './services/auth-state.js';
import { apiRequest } from './services/api-client.js';
import { orchestrationAdapter } from './services/orchestration.service.js';

import { AuthGlassView } from './pages/AuthGlassView.js';
import { NotFoundView } from './pages/NotFoundView.js';

const viewMap = {
    AuthGlassView,
    LoginView: () => new AuthGlassView('login'),
    RegisterView: () => new AuthGlassView('signup'),
    DashboardView: () => new AuthGlassView('welcome'),
    NotFoundView: () => new NotFoundView(),
};

let currentViewInstance = null;

async function bootstrap() {
    const rootElement = document.getElementById('app');
    if (!rootElement) return;

    const appLayout = new App();
    appLayout.mount(rootElement);

    const outlet = document.getElementById('router-outlet');

    // ارتباط اولیه با سرور برای دریافت وضعیت سلامت و شناسایی Pod
    orchestrationAdapter.resolvePod().catch(() => { });

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

        const factory = viewMap[componentName] || viewMap.NotFoundView;
        currentViewInstance = typeof factory === 'function' && !factory.prototype ? factory() : new factory();

        if (outlet) {
            outlet.innerHTML = '';
            currentViewInstance.mount(outlet);
        }
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
