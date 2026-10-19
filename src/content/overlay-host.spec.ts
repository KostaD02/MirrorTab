/**
 * @jest-environment jsdom
 */

import { APP_NAME } from '@/shared/consts';
import { OverlayHost } from './overlay-host';

describe('OverlayHost', () => {
  const getHostEl = () => document.getElementById(`${APP_NAME}-overlay`);

  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('keeps the host out of the page until mounted', () => {
    const host = new OverlayHost();

    expect(getHostEl()).toBeNull();
    expect(host.root.querySelector('style')?.textContent).toContain(
      '--kd-accent: #64ffda;',
    );
  });

  it('mounts once on the document element with a closed shadow root', () => {
    const host = new OverlayHost();

    host.mount();
    host.mount();

    const el = getHostEl();
    expect(el?.parentElement).toBe(document.documentElement);
    expect(document.querySelectorAll(`#${APP_NAME}-overlay`)).toHaveLength(1);
    expect(el?.shadowRoot).toBeNull();
  });
});
