/**
 * State store for dynamic Pod identification
 */
class PodState {
    constructor() {
        this.podId = null;
        this.listeners = new Set();
    }

    getPodId() {
        return this.podId;
    }

    setPodId(id) {
        if (id && id !== this.podId) {
            this.podId = id;
            this.notify();
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.podId);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach((fn) => fn(this.podId));
    }
}

export const podState = new PodState();
