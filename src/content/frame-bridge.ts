import { SessionRole, SessionRoleEnum } from '@/shared/types';
import { getSemanticSelector } from '@/shared/util';

export const FRAME_PATH_SEPARATOR = ' >> ';

const PATH_REQUEST_INTERVAL_MS = 500;
const MAX_PATH_REQUESTS = 40;

export interface CursorTarget {
  moveTo(x: number, y: number): void;
  animateClick(x: number, y: number): void;
}

export interface FrameContext extends CursorTarget {
  readonly path: string | null;
}

type BridgeMessage =
  | { kind: 'path-request' }
  | { kind: 'path'; path: string; role: SessionRole }
  | { kind: 'cursor'; action: 'move' | 'click'; x: number; y: number };

type BridgeEnvelope = BridgeMessage & { mirrorTab: string };

export function isTopFrame(win: Window = window): boolean {
  return win.self === win.top;
}

function isEnvelope(data: unknown): data is BridgeEnvelope {
  if (typeof data !== 'object' || data === null) return false;
  const candidate = data as Record<string, unknown>;
  return (
    candidate.mirrorTab === chrome.runtime.id &&
    typeof candidate.kind === 'string'
  );
}

// ? every frame runs its own content script; this links them so events carry the frame they
// happened in and the ghost cursor, which only the top frame draws, is placed over the iframe
export class FrameBridge implements FrameContext {
  private resolvedPath: string | null;
  private role: SessionRole = SessionRoleEnum.Idle;
  private requests = 0;
  private requestTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly waitingChildren: HTMLIFrameElement[] = [];
  private readonly resolvedListeners = new Set<
    (path: string, role: SessionRole) => void
  >();

  constructor(
    private readonly cursor: CursorTarget | null,
    private readonly win: Window = window,
  ) {
    this.resolvedPath = isTopFrame(win) ? '' : null;
    win.addEventListener('message', (event: MessageEvent) => {
      this.onMessage(event);
    });
    if (this.resolvedPath === null) this.requestPath();
  }

  get path(): string | null {
    return this.resolvedPath;
  }

  setRole(role: SessionRole): void {
    this.role = role;
  }

  onResolved(listener: (path: string, role: SessionRole) => void): void {
    this.resolvedListeners.add(listener);
  }

  moveTo(x: number, y: number): void {
    if (this.cursor) {
      this.cursor.moveTo(x, y);
    } else {
      this.postToParent({ kind: 'cursor', action: 'move', x, y });
    }
  }

  animateClick(x: number, y: number): void {
    if (this.cursor) {
      this.cursor.animateClick(x, y);
    } else {
      this.postToParent({ kind: 'cursor', action: 'click', x, y });
    }
  }

  private onMessage(event: MessageEvent): void {
    const data: unknown = event.data;
    if (!isEnvelope(data)) return;

    switch (data.kind) {
      case 'path-request': {
        const frame = this.findFrame(event.source);
        if (!frame) return;
        if (this.resolvedPath === null) {
          this.waitingChildren.push(frame);
        } else {
          this.answer(frame);
        }
        break;
      }

      case 'path': {
        if (this.resolvedPath !== null) return;
        if (event.source !== this.win.parent) return;
        if (typeof data.path !== 'string') return;
        this.resolve(data.path, data.role);
        break;
      }

      case 'cursor': {
        const frame = this.findFrame(event.source);
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const x = rect.left + frame.clientLeft + data.x;
        const y = rect.top + frame.clientTop + data.y;
        if (data.action === 'move') {
          this.moveTo(x, y);
        } else {
          this.animateClick(x, y);
        }
        break;
      }
    }
  }

  private findFrame(
    source: MessageEventSource | null,
  ): HTMLIFrameElement | null {
    if (!source) return null;
    const frames = this.win.document.querySelectorAll('iframe');
    for (const frame of frames) {
      if (frame.contentWindow === source) return frame;
    }
    return null;
  }

  private answer(frame: HTMLIFrameElement): void {
    const selector = getSemanticSelector(frame);
    const own = this.resolvedPath ?? '';
    const path = own ? `${own}${FRAME_PATH_SEPARATOR}${selector}` : selector;
    frame.contentWindow?.postMessage(
      this.envelope({ kind: 'path', path, role: this.role }),
      '*',
    );
  }

  private resolve(path: string, role: SessionRole): void {
    this.resolvedPath = path;
    this.role = role;
    if (this.requestTimer !== null) {
      clearTimeout(this.requestTimer);
      this.requestTimer = null;
    }
    for (const listener of this.resolvedListeners) listener(path, role);
    for (const frame of this.waitingChildren.splice(0)) this.answer(frame);
  }

  private requestPath(): void {
    if (this.resolvedPath !== null || this.requests >= MAX_PATH_REQUESTS) {
      return;
    }
    this.requests++;
    this.postToParent({ kind: 'path-request' });
    this.requestTimer = setTimeout(() => {
      this.requestTimer = null;
      this.requestPath();
    }, PATH_REQUEST_INTERVAL_MS);
  }

  private postToParent(message: BridgeMessage): void {
    this.win.parent.postMessage(this.envelope(message), '*');
  }

  private envelope(message: BridgeMessage): BridgeEnvelope {
    return { ...message, mirrorTab: chrome.runtime.id };
  }
}
