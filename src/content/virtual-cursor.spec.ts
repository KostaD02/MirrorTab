/**
 * @jest-environment jsdom
 */

import { APP_NAME } from '@/shared/consts';
import { OverlayHost } from './overlay-host';
import { VirtualCursor } from './virtual-cursor';

describe('VirtualCursor', () => {
  let host: OverlayHost;
  let cursor: VirtualCursor;

  const getCursor = () => host.root.querySelector<HTMLElement>('.cursor');
  const getRipple = () => host.root.querySelector<HTMLElement>('.ripple');
  const getLayer = () => getCursor()?.parentElement ?? null;

  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    host = new OverlayHost();
    cursor = new VirtualCursor(host);
  });

  describe('show', () => {
    it('mounts the overlay with the cursor and ripple on first call', () => {
      expect(getCursor()).toBeNull();

      cursor.show();

      expect(document.getElementById(`${APP_NAME}-overlay`)).not.toBeNull();
      expect(getCursor()).not.toBeNull();
      expect(getRipple()).not.toBeNull();
      expect(getLayer()?.hidden).toBe(false);
    });

    it('reuses the existing layer on subsequent calls', () => {
      cursor.show();
      const first = getLayer();
      cursor.hide();

      cursor.show();
      const second = getLayer();

      expect(second).toBe(first);
      expect(second?.hidden).toBe(false);
      expect(host.root.querySelectorAll('.cursor')).toHaveLength(1);
    });
  });

  describe('hide', () => {
    it('hides the layer after mount', () => {
      cursor.show();
      cursor.hide();

      expect(getLayer()?.hidden).toBe(true);
    });

    it('is a no-op if never mounted', () => {
      expect(() => {
        cursor.hide();
      }).not.toThrow();
      expect(getCursor()).toBeNull();
      expect(document.getElementById(`${APP_NAME}-overlay`)).toBeNull();
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

      expect(getCursor()?.style.transform).toBe('translate(12px, 46px)');
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

      const rippleEl = getRipple() as HTMLElement;

      expect(getCursor()?.style.transform).toBe('translate(100px, 200px)');
      expect(rippleEl.style.getPropertyValue('--rx')).toBe('84px');
      expect(rippleEl.style.getPropertyValue('--ry')).toBe('184px');
      expect(rippleEl.classList.contains('active')).toBe(true);
    });

    it('removes the active class when the ripple animation ends', () => {
      cursor.show();
      cursor.animateClick(50, 50);

      const rippleEl = getRipple() as HTMLElement;
      expect(rippleEl.classList.contains('active')).toBe(true);

      rippleEl.dispatchEvent(new Event('animationend'));

      expect(rippleEl.classList.contains('active')).toBe(false);
    });
  });
});
