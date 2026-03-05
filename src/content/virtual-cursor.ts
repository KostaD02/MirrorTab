import { APP_NAME } from '@/shared/consts';

export class VirtualCursor {
  private readonly host: HTMLDivElement;
  private readonly cursorEl: HTMLElement;
  private readonly rippleEl: HTMLElement;

  constructor() {
    const { host, cursorEl, rippleEl } = this.mount();
    this.host = host;
    this.cursorEl = cursorEl;
    this.rippleEl = rippleEl;
    this.hide();
  }

  moveTo(x: number, y: number): void {
    this.cursorEl.style.transform = `translate(${String(Math.round(x))}px, ${String(Math.round(y))}px)`;
  }

  animateClick(x: number, y: number): void {
    this.moveTo(x, y);

    const r = this.rippleEl;
    r.style.setProperty('--rx', `${String(Math.round(x - 16))}px`);
    r.style.setProperty('--ry', `${String(Math.round(y - 16))}px`);
    r.classList.remove('active');
    void r.offsetWidth;
    r.classList.add('active');
  }

  show(): void {
    this.host.style.display = 'block';
  }

  hide(): void {
    this.host.style.display = 'none';
  }

  private mount(): {
    host: HTMLDivElement;
    cursorEl: HTMLElement;
    rippleEl: HTMLElement;
  } {
    const host = document.createElement('div');
    host.id = `${APP_NAME}-cursor-host`;
    Object.assign(host.style, {
      all: 'initial',
      position: 'fixed',
      top: '0',
      left: '0',
      width: '0',
      height: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      overflow: 'visible',
    });

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .mt-cursor {
        position: fixed;
        top: 0;
        left: 0;
        width: 18px;
        height: 21px;
        pointer-events: none;
        transform: translate(0, 0);
        transition: transform 50ms linear;
        will-change: transform;
        filter:
          drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35))
          drop-shadow(0 0px 4px rgba(100, 255, 218, 0.2));
      }

      .mt-ripple {
        position: fixed;
        top: 0;
        left: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid rgba(100, 255, 218, 0.7);
        box-shadow: 0 0 0 0 rgba(100, 255, 218, 0.25);
        background: rgba(100, 255, 218, 0.07);
        pointer-events: none;
        opacity: 0;
        transform: translate(0, 0) scale(0);
      }

      .mt-ripple.active {
        animation: mt-ripple-anim 480ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }

      @keyframes mt-ripple-anim {
        0%   { transform: translate(var(--rx), var(--ry)) scale(0.15); opacity: 1; }
        60%  { opacity: 0.7; }
        100% { transform: translate(var(--rx), var(--ry)) scale(1.9);  opacity: 0; }
      }
    `;

    const cursorEl = document.createElement('div');
    cursorEl.className = 'mt-cursor';
    cursorEl.innerHTML = `
      <svg width="18" height="21" viewBox="0 0 22 26"
           fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3.5 2L3.5 21.5L8 17L11.5 24.5L14.5 23L11 15.5L17.5 15.5L3.5 2Z"
          fill="white"
          stroke="#0000007c"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    `.trim();

    const rippleEl = document.createElement('div');
    rippleEl.className = 'mt-ripple';
    rippleEl.addEventListener('animationend', () => {
      rippleEl.classList.remove('active');
    });

    shadow.appendChild(style);
    shadow.appendChild(cursorEl);
    shadow.appendChild(rippleEl);

    document.documentElement.appendChild(host);

    return { host, cursorEl, rippleEl };
  }
}
