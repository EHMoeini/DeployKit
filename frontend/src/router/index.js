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
        if (route && route.requiresAuth && !authState.isAuthenticated()) {
            target = '/login';
        }

        // گارد مهمان
        if (route && route.guestOnly && authState.isAuthenticated()) {
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
