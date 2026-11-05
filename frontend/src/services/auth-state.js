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
