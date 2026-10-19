import { APP_NAME } from '@/shared/consts';
import styles from './overlay.scss?inline';
import { brandTokens } from './brand-tokens';

// ? one closed shadow root for everything MirrorTab draws on a page, so page styles cannot reach in
export class OverlayHost {
  readonly root: ShadowRoot;
  private readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = `${APP_NAME}-overlay`;
    this.root = this.element.attachShadow({ mode: 'closed' });
    const sheet = document.createElement('style');
    sheet.textContent = brandTokens(':host') + styles;
    this.root.appendChild(sheet);
  }

  mount(): void {
    if (!this.element.isConnected) {
      document.documentElement.appendChild(this.element);
    }
  }
}
