/**
 * @jest-environment jsdom
 */

import { APP_NAME } from '@/shared/consts';
import { VirtualCursor } from './virtual-cursor';

describe('VirtualCursor', () => {
  let cursor: VirtualCursor;

  const getHost = () =>
    document.getElementById(`${APP_NAME}-cursor-host`) as HTMLDivElement | null;

  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    cursor = new VirtualCursor();
  });

  describe('show', () => {
    it('mounts host with a shadow root on first call', () => {
      expect(getHost()).toBeNull();

      cursor.show();

      const host = getHost();
      expect(host).not.toBeNull();
      expect(host?.style.display).toBe('block');
      expect(host?.shadowRoot).not.toBeNull();
      expect(host?.shadowRoot?.querySelector('.mt-cursor')).not.toBeNull();
      expect(host?.shadowRoot?.querySelector('.mt-ripple')).not.toBeNull();
    });

    it('reuses existing host on subsequent calls', () => {
      cursor.show();
      const first = getHost();
      cursor.hide();

      cursor.show();
      const second = getHost();

      expect(second).toBe(first);
      expect(second?.style.display).toBe('block');
    });
  });

  describe('hide', () => {
    it('sets host display to none after mount', () => {
      cursor.show();
      cursor.hide();

      expect(getHost()?.style.display).toBe('none');
    });

    it('is a no-op if never mounted', () => {
      expect(() => {
        cursor.hide();
      }).not.toThrow();
      expect(getHost()).toBeNull();
    });
  });

  describe('moveTo', () => {
    it('does nothing before mount', () => {
      expect(() => {
        cursor.moveTo(10, 20);
      }).not.toThrow();
    });

    it('applies a translate transform using rounded coordinates', () => {
      cursor.show();
      cursor.moveTo(12.3, 45.7);

      const cursorEl = getHost()?.shadowRoot?.querySelector(
        '.mt-cursor',
      ) as HTMLElement;
      expect(cursorEl.style.transform).toBe('translate(12px, 46px)');
    });
  });

  describe('animateClick', () => {
    it('does nothing before mount', () => {
      expect(() => {
        cursor.animateClick(10, 10);
      }).not.toThrow();
    });

    it('moves the cursor and activates the ripple', () => {
      cursor.show();
      cursor.animateClick(100, 200);

      const shadow = getHost()?.shadowRoot;
      const cursorEl = shadow?.querySelector('.mt-cursor') as HTMLElement;
      const rippleEl = shadow?.querySelector('.mt-ripple') as HTMLElement;

      expect(cursorEl.style.transform).toBe('translate(100px, 200px)');
      expect(rippleEl.style.getPropertyValue('--rx')).toBe('84px');
      expect(rippleEl.style.getPropertyValue('--ry')).toBe('184px');
      expect(rippleEl.classList.contains('active')).toBe(true);
    });

    it('removes the active class when the ripple animation ends', () => {
      cursor.show();
      cursor.animateClick(50, 50);

      const rippleEl = getHost()?.shadowRoot?.querySelector(
        '.mt-ripple',
      ) as HTMLElement;
      expect(rippleEl.classList.contains('active')).toBe(true);

      rippleEl.dispatchEvent(new Event('animationend'));

      expect(rippleEl.classList.contains('active')).toBe(false);
    });
  });
});
