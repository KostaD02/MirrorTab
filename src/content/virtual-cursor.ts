import { OverlayHost } from './overlay-host';

export class VirtualCursor {
  private layer: HTMLDivElement | null = null;
  private cursorEl: HTMLElement | null = null;
  private rippleEl: HTMLElement | null = null;

  constructor(private readonly host: OverlayHost) {}

  moveTo(x: number, y: number): void {
    if (!this.cursorEl) return;
    this.cursorEl.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
  }

  animateClick(x: number, y: number): void {
    this.moveTo(x, y);
    if (!this.rippleEl) return;

    const r = this.rippleEl;
    r.style.setProperty('--rx', `${String(Math.round(x - 16))}px`);
    r.style.setProperty('--ry', `${String(Math.round(y - 16))}px`);
    r.classList.remove('active');
    void r.offsetWidth;
    r.classList.add('active');
  }

  show(): void {
    if (!this.layer) {
      this.mount();
    }

    if (this.layer) {
      this.layer.hidden = false;
    }
  }

  hide(): void {
    if (!this.layer) return;
    this.layer.hidden = true;
  }

  private mount(): void {
    this.host.mount();

    const layer = document.createElement('div');

    const cursorEl = document.createElement('div');
    cursorEl.className = 'cursor';
    cursorEl.innerHTML = `
      <svg width="18" height="21" viewBox="0 0 22 26"
           fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3.5 2L3.5 21.5L8 17L11.5 24.5L14.5 23L11 15.5L17.5 15.5L3.5 2Z"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    `.trim();

    const rippleEl = document.createElement('div');
    rippleEl.className = 'ripple';
    rippleEl.addEventListener('animationend', () => {
      rippleEl.classList.remove('active');
    });

    layer.append(cursorEl, rippleEl);
    this.host.root.appendChild(layer);

    this.layer = layer;
    this.cursorEl = cursorEl;
    this.rippleEl = rippleEl;
  }
}
