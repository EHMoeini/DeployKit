import { GlassSculpture } from './components/GlassSculpture.js';
import { PodFooter } from './components/PodFooter.js';

export class App {
    constructor() {
        this.container = null;
        this.sculpture = new GlassSculpture();
        this.podFooter = new PodFooter();
    }

    render() {
        return `
      <div class="spatial-viewport">
        <main class="spatial-stage">
          <div id="sculpture-container"></div>
          <div id="router-outlet"></div>
        </main>
        <div id="pod-footer-container"></div>
      </div>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();

        const sculptureEl = this.container.querySelector('#sculpture-container');
        if (sculptureEl) {
            this.sculpture.mount(sculptureEl);
        }

        const podFooterEl = this.container.querySelector('#pod-footer-container');
        if (podFooterEl) {
            this.podFooter.mount(podFooterEl);
        }
    }

    unmount() {
        if (this.sculpture) {
            this.sculpture.unmount();
        }
        if (this.podFooter) {
            this.podFooter.unmount();
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
