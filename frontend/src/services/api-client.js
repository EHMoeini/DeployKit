import { authState } from './auth-state.js';
import { podState } from './pod-state.js';

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

    // استخراج پاد ای‌دی از هدرهای پاسخ در صورت وجود
    const podHeader = response.headers.get('x-pod-id');
    if (podHeader) {
        podState.setPodId(podHeader);
    }

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
