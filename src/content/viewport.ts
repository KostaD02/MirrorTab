import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRole,
  SessionRoleEnum,
} from '@/shared/types';

const RESIZE_DEBOUNCE_MS = 150;

// ? a target window is resized to match this, so both tabs lay out at the same breakpoint
export class ViewportReporter {
  private role: SessionRole = SessionRoleEnum.Idle;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly win: Window = window) {
    this.win.addEventListener('resize', () => {
      this.queue();
    });
  }

  setRole(role: SessionRole): void {
    this.role = role;
    this.report();
  }

  private queue(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.report();
    }, RESIZE_DEBOUNCE_MS);
  }

  private report(): void {
    if (
      this.role !== SessionRoleEnum.Source &&
      this.role !== SessionRoleEnum.Target
    ) {
      return;
    }

    const message: ExtensionMessage = {
      type: ExtensionMessageTypeEnum.Viewport,
      payload: {
        width: this.win.innerWidth,
        height: this.win.innerHeight,
      },
    };
    chrome.runtime.sendMessage(message).catch(() => {
      // safe drop
    });
  }
}
