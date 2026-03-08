import { APP_NAME } from '@/shared/consts';
import { SessionRole, SessionRoleEnum } from '@/shared/types';

const ROLE_CONFIG: Record<
  Exclude<SessionRole, typeof SessionRoleEnum.Idle>,
  { label: string; bg: string }
> = {
  [SessionRoleEnum.Source]: { label: 'SOURCE', bg: '#ef4444cc' },
  [SessionRoleEnum.Target]: { label: 'TARGET', bg: '#22c55ecc' },
  [SessionRoleEnum.Replay]: { label: 'REPLAY', bg: '#6366f1cc' },
};

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

    const config = ROLE_CONFIG[role];
    this.element.textContent = `${APP_NAME} · ${config.label}`;
    this.element.style.background = config.bg;
  }
}
