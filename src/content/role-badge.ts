import { APP_NAME } from '@/shared/consts';
import { SessionRole, SessionRoleEnum } from '@/shared/types';

export class RoleBadge {
  private element: HTMLElement | null = null;

  update(role: SessionRole): void {
    if (role === SessionRoleEnum.Idle) {
      this.element?.remove();
      this.element = null;
      return;
    }

    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = `${APP_NAME}-badge`;
      Object.assign(this.element.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: '2147483647',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontWeight: '700',
        padding: '5px 10px',
        borderRadius: '8px',
        backdropFilter: 'blur(6px)',
        boxShadow: '0 2px 8px rgba(0,0,0,.3)',
        pointerEvents: 'none',
        letterSpacing: '.4px',
        transition: 'background .3s',
      });
      document.documentElement.appendChild(this.element);
    }

    this.element.textContent =
      role === SessionRoleEnum.Source
        ? `${APP_NAME} · SOURCE`
        : `${APP_NAME} · TARGET`;
    this.element.style.background =
      role === SessionRoleEnum.Source ? '#ef4444cc' : '#22c55ecc';
  }
}
