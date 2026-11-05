export class GlassSculpture {
    constructor() {
        this.container = null;
        this.handleMouseMove = this.handleMouseMove.bind(this);
    }

    render() {
        return `
      <div class="spatial-sculpture-wrapper" aria-hidden="true">
        <div class="spatial-sculpture-scene">
          <svg class="spatial-sculpture-svg" viewBox="0 0 700 700" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <!-- فیلترهای شکست نور و بلور نرم سطوح شیشه‌ای -->
              <filter id="glass-refraction-1" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              <linearGradient id="facet-grad-1" x1="120" y1="80" x2="480" y2="520" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#9ACFE4" stop-opacity="0.32" />
                <stop offset="45%" stop-color="#AAA5D8" stop-opacity="0.12" />
                <stop offset="100%" stop-color="#111927" stop-opacity="0.05" />
              </linearGradient>

              <linearGradient id="facet-grad-2" x1="280" y1="120" x2="620" y2="480" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28" />
                <stop offset="35%" stop-color="#9ACFE4" stop-opacity="0.14" />
                <stop offset="100%" stop-color="#080B12" stop-opacity="0.02" />
              </linearGradient>

              <linearGradient id="facet-grad-3" x1="80" y1="280" x2="440" y2="600" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#AAA5D8" stop-opacity="0.25" />
                <stop offset="60%" stop-color="#9ACFE4" stop-opacity="0.08" />
                <stop offset="100%" stop-color="#101724" stop-opacity="0.03" />
              </linearGradient>

              <linearGradient id="facet-grad-core" x1="240" y1="200" x2="460" y2="440" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.45" />
                <stop offset="50%" stop-color="#9ACFE4" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#AAA5D8" stop-opacity="0.05" />
              </linearGradient>

              <linearGradient id="specular-line-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.8" />
                <stop offset="50%" stop-color="#9ACFE4" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0" />
              </linearGradient>

              <linearGradient id="specular-line-2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.75" />
                <stop offset="60%" stop-color="#AAA5D8" stop-opacity="0.2" />
                <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0" />
              </linearGradient>
            </defs>

            <!-- هاله نور پس‌زمینه المان -->
            <ellipse cx="350" cy="350" rx="220" ry="220" fill="radial-gradient(circle, rgba(154,207,228,0.12) 0%, rgba(170,165,216,0.04) 50%, transparent 80%)" />

            <!-- لایه ۱: باله شیشه‌ای معلق خلفی -->
            <polygon class="glass-facet facet-back"
              points="140,160 380,90 480,290 240,360"
              fill="url(#facet-grad-1)"
              stroke="url(#specular-line-1)"
              stroke-width="1.2"
              stroke-linecap="round"
            />

            <!-- لایه ۲: منشور شکست نور زاویه‌دار -->
            <polygon class="glass-facet facet-mid-left"
              points="110,310 290,240 370,490 190,560"
              fill="url(#facet-grad-3)"
              stroke="url(#specular-line-2)"
              stroke-width="1"
              stroke-linecap="round"
            />

            <!-- لایه ۳: تیغه شیشه‌ای کشیده مرکزی -->
            <polygon class="glass-facet facet-core"
              points="260,140 520,210 440,510 180,440"
              fill="url(#facet-grad-core)"
              stroke="url(#specular-line-1)"
              stroke-width="1.5"
              stroke-linecap="round"
            />

            <!-- لایه ۴: برش شیشه‌ای پیش‌زمینه با بازتاب تیز -->
            <polygon class="glass-facet facet-front"
              points="340,110 590,230 520,430 270,310"
              fill="url(#facet-grad-2)"
              stroke="url(#specular-line-2)"
              stroke-width="1.2"
              stroke-linecap="round"
            />

            <!-- رگه‌های بازتاب فیزیکی نور لبه‌ها -->
            <line x1="260" y1="140" x2="520" y2="210" stroke="#FFFFFF" stroke-opacity="0.65" stroke-width="1.5" stroke-linecap="round" />
            <line x1="140" y1="160" x2="380" y2="90" stroke="#9ACFE4" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round" />
            <line x1="270" y1="310" x2="520" y2="430" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="1" stroke-linecap="round" />
          </svg>
        </div>
      </div>
    `;
    }

    mount(container) {
        this.container = container;
        this.container.innerHTML = this.render();
        window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    }

    handleMouseMove(e) {
        if (!this.container) return;
        const scene = this.container.querySelector('.spatial-sculpture-scene');
        if (!scene) return;

        // حرکت بسیار ملایم متناسب با موقعیت نشانگر ماوس
        const xRatio = (e.clientX / window.innerWidth - 0.5) * 16;
        const yRatio = (e.clientY / window.innerHeight - 0.5) * 16;

        scene.style.transform = `translate3d(${xRatio}px, ${yRatio}px, 0) rotate3d(1, 1, 0, ${(xRatio + yRatio) * 0.15}deg)`;
    }

    unmount() {
        window.removeEventListener('mousemove', this.handleMouseMove);
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
