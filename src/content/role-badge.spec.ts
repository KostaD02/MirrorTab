/**
 * @jest-environment jsdom
 */

import { APP_NAME } from '@/shared/consts';
import { SessionRoleEnum } from '@/shared/types';
import { OverlayHost } from './overlay-host';
import { RoleBadge } from './role-badge';

describe('RoleBadge', () => {
  let host: OverlayHost;
  let badge: RoleBadge;

  const getBadgeEl = () => host.root.getElementById(`${APP_NAME}-badge`);

  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    host = new OverlayHost();
    badge = new RoleBadge(host);
  });

  describe('update', () => {
    it('mounts the overlay and creates the badge on first non-idle update', () => {
      expect(getBadgeEl()).toBeNull();
      expect(document.getElementById(`${APP_NAME}-overlay`)).toBeNull();

      badge.update(SessionRoleEnum.Source);

      const el = getBadgeEl();
      expect(document.getElementById(`${APP_NAME}-overlay`)).not.toBeNull();
      expect(el?.textContent).toBe(`${APP_NAME} · SOURCE`);
      expect(el?.classList).toContain('kd-status-pill');
      expect(el?.classList).toContain('kd-status-pill--danger');
    });

    it('updates label and pill variant when role changes', () => {
      badge.update(SessionRoleEnum.Source);
      const first = getBadgeEl();

      badge.update(SessionRoleEnum.Target);
      const second = getBadgeEl();

      expect(second).toBe(first);
      expect(second?.textContent).toBe(`${APP_NAME} · TARGET`);
      expect(second?.classList).toContain('kd-status-pill--active');
      expect(second?.classList).not.toContain('kd-status-pill--danger');
    });

    it('applies replay styling', () => {
      badge.update(SessionRoleEnum.Replay);

      const el = getBadgeEl();
      expect(el?.textContent).toBe(`${APP_NAME} · REPLAY`);
      expect(el?.classList).toContain('kd-status-pill--warning');
    });

    it('removes the badge when role becomes idle', () => {
      badge.update(SessionRoleEnum.Source);
      expect(getBadgeEl()).not.toBeNull();

      badge.update(SessionRoleEnum.Idle);

      expect(getBadgeEl()).toBeNull();
    });

    it('is a no-op when idle is received before any badge exists', () => {
      expect(() => {
        badge.update(SessionRoleEnum.Idle);
      }).not.toThrow();
      expect(getBadgeEl()).toBeNull();
    });

    it('recreates the badge when going idle then active again', () => {
      badge.update(SessionRoleEnum.Source);
      badge.update(SessionRoleEnum.Idle);
      badge.update(SessionRoleEnum.Target);

      const el = getBadgeEl();
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe(`${APP_NAME} · TARGET`);
    });
  });
});
