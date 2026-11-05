import { podState } from '../services/pod-state.js';

export class PodFooter {
    constructor() {
        this.container = null;
        this.unsubscribe = null;
    }

    render() {
        const podId = podState.getPodId() || 'resolving...';
        return `
      <div class="pod-footer-fixed" dir="ltr">
        <span class="pod-indicator-dot"></span>
        <span class="pod-label">POD &middot; <span class="pod-id-value">${podId}</span></span>
      </div>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();

        this.unsubscribe = podState.subscribe((newPodId) => {
            const valEl = this.container.querySelector('.pod-id-value');
            if (valEl) {
                valEl.textContent = newPodId || 'resolving...';
            }
        });
    }

    unmount() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
