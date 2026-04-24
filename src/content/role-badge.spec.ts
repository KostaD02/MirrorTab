/**
 * @jest-environment jsdom
 */

import { APP_NAME } from '@/shared/consts';
import { SessionRoleEnum } from '@/shared/types';
import { RoleBadge } from './role-badge';

describe('RoleBadge', () => {
  let badge: RoleBadge;

  const getBadgeEl = () => document.getElementById(`${APP_NAME}-badge`);

  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    badge = new RoleBadge();
  });

  describe('update', () => {
    it('creates the badge element on first non-idle update', () => {
      expect(getBadgeEl()).toBeNull();

      badge.update(SessionRoleEnum.Source);

      const el = getBadgeEl();
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe(`${APP_NAME} · SOURCE`);
      expect(el?.style.position).toBe('fixed');
      expect(el?.style.background).toBe('rgba(239, 68, 68, 0.8)');
    });

    it('updates label and background when role changes', () => {
      badge.update(SessionRoleEnum.Source);
      const first = getBadgeEl();

      badge.update(SessionRoleEnum.Target);
      const second = getBadgeEl();

      expect(second).toBe(first);
      expect(second?.textContent).toBe(`${APP_NAME} · TARGET`);
      expect(second?.style.background).toBe('rgba(34, 197, 94, 0.8)');
    });

    it('applies replay styling', () => {
      badge.update(SessionRoleEnum.Replay);

      const el = getBadgeEl();
      expect(el?.textContent).toBe(`${APP_NAME} · REPLAY`);
      expect(el?.style.background).toBe('rgba(99, 102, 241, 0.8)');
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
