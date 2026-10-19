import { APP_NAME } from '@/shared/consts';
import { SessionRole, SessionRoleEnum } from '@/shared/types';
import { OverlayHost } from './overlay-host';

const ROLE_CONFIG: Record<
  Exclude<SessionRole, typeof SessionRoleEnum.Idle>,
  { label: string; pill: string }
> = {
  [SessionRoleEnum.Source]: { label: 'SOURCE', pill: 'danger' },
  [SessionRoleEnum.Target]: { label: 'TARGET', pill: 'active' },
  [SessionRoleEnum.Replay]: { label: 'REPLAY', pill: 'warning' },
};

export class RoleBadge {
  private element: HTMLElement | null = null;
  private label: HTMLSpanElement | null = null;

  constructor(private readonly host: OverlayHost) {}

  update(role: SessionRole): void {
    if (role === SessionRoleEnum.Idle) {
      this.element?.remove();
      this.element = null;
      this.label = null;
      return;
    }

    if (!this.element || !this.label) {
      this.host.mount();
      this.element = document.createElement('div');
      this.element.id = `${APP_NAME}-badge`;
      const dot = document.createElement('span');
      dot.className = 'kd-status-pill__dot';
      this.label = document.createElement('span');
      this.element.append(dot, this.label);
      this.host.root.appendChild(this.element);
    }

    const config = ROLE_CONFIG[role];
    this.element.className = `badge kd-status-pill kd-status-pill--${config.pill}`;
    this.label.textContent = `${APP_NAME} · ${config.label}`;
  }
}
