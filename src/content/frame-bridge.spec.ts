/**
 * @jest-environment jsdom
 */

// jsdom does not expose `CSS`, but selector util calls `CSS.escape`
if (typeof CSS === 'undefined') {
  Object.defineProperty(globalThis, 'CSS', {
    value: { escape: (s: string) => s },
    writable: true,
  });
}

import { chrome } from 'jest-chrome';
import { SessionRoleEnum } from '@/shared/types';
import { FRAME_PATH_SEPARATOR, FrameBridge, isTopFrame } from './frame-bridge';

const EXT_ID = 'mirror-tab-test';

type Listener = (event: MessageEvent) => void;

interface FakeChild {
  win: Window;
  parentPost: jest.Mock;
  dispatch(data: unknown, source: MessageEventSource | null): void;
}

function makeChild(): FakeChild {
  const listeners: Listener[] = [];
  const parentPost = jest.fn();
  const base = {
    document,
    parent: { postMessage: parentPost },
    top: window,
    addEventListener: (_type: string, listener: Listener) => {
      listeners.push(listener);
    },
  };
  Object.assign(base, { self: base });
  const win = base as unknown as Window;
  return {
    win,
    parentPost,
    dispatch: (data, source) => {
      for (const listener of listeners) {
        listener({ data, source } as MessageEvent);
      }
    },
  };
}

function envelope(message: Record<string, unknown>) {
  return { mirrorTab: EXT_ID, ...message };
}

function mountIframe(id: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.id = id;
  document.body.appendChild(iframe);
  jest.spyOn(iframe, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    top: 50,
    width: 300,
    height: 200,
    right: 400,
    bottom: 250,
    x: 100,
    y: 50,
    toJSON: () => ({}),
  } as DOMRect);
  return iframe;
}

function postToTop(data: unknown, source: MessageEventSource | null): void {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

describe('FrameBridge', () => {
  beforeAll(() => {
    Object.defineProperty(chrome.runtime, 'id', {
      value: EXT_ID,
      configurable: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isTopFrame', () => {
    it('is true for the page window and false for a child window', () => {
      expect(isTopFrame(window)).toBe(true);
      expect(isTopFrame(makeChild().win)).toBe(false);
    });
  });

  describe('in the top frame', () => {
    it('has an empty path at once and asks nobody', () => {
      const bridge = new FrameBridge(null);

      expect(bridge.path).toBe('');
    });

    it('answers a child with the iframe selector and the current role', () => {
      const bridge = new FrameBridge(null);
      bridge.setRole(SessionRoleEnum.Target);
      const iframe = mountIframe('widget');
      const childPost = jest.spyOn(iframe.contentWindow!, 'postMessage');

      postToTop(envelope({ kind: 'path-request' }), iframe.contentWindow);

      expect(childPost).toHaveBeenCalledWith(
        envelope({
          kind: 'path',
          path: '#widget',
          role: SessionRoleEnum.Target,
        }),
        '*',
      );
    });

    it('ignores requests that do not come from one of its iframes', () => {
      new FrameBridge(null);
      const iframe = mountIframe('widget');
      const childPost = jest.spyOn(iframe.contentWindow!, 'postMessage');

      postToTop(envelope({ kind: 'path-request' }), window);
      postToTop(envelope({ kind: 'path-request' }), null);

      expect(childPost).not.toHaveBeenCalled();
    });

    it('ignores messages without the extension envelope', () => {
      new FrameBridge(null);
      const iframe = mountIframe('widget');
      const childPost = jest.spyOn(iframe.contentWindow!, 'postMessage');

      postToTop({ kind: 'path-request' }, iframe.contentWindow);
      postToTop('hello', iframe.contentWindow);
      postToTop(null, iframe.contentWindow);

      expect(childPost).not.toHaveBeenCalled();
    });

    it('draws the cursor itself, offset by the iframe position', () => {
      const cursor = { moveTo: jest.fn(), animateClick: jest.fn() };
      new FrameBridge(cursor);
      const iframe = mountIframe('widget');
      Object.defineProperty(iframe, 'clientLeft', { value: 2 });
      Object.defineProperty(iframe, 'clientTop', { value: 3 });

      postToTop(
        envelope({ kind: 'cursor', action: 'move', x: 10, y: 20 }),
        iframe.contentWindow,
      );
      postToTop(
        envelope({ kind: 'cursor', action: 'click', x: 10, y: 20 }),
        iframe.contentWindow,
      );

      expect(cursor.moveTo).toHaveBeenCalledWith(112, 73);
      expect(cursor.animateClick).toHaveBeenCalledWith(112, 73);
    });

    it('moves and clicks the cursor directly for its own events', () => {
      const cursor = { moveTo: jest.fn(), animateClick: jest.fn() };
      const bridge = new FrameBridge(cursor);

      bridge.moveTo(1, 2);
      bridge.animateClick(3, 4);

      expect(cursor.moveTo).toHaveBeenCalledWith(1, 2);
      expect(cursor.animateClick).toHaveBeenCalledWith(3, 4);
    });
  });

  describe('in a child frame', () => {
    it('starts unresolved and asks its parent until answered', () => {
      const child = makeChild();
      const bridge = new FrameBridge(null, child.win);

      expect(bridge.path).toBeNull();
      expect(child.parentPost).toHaveBeenCalledTimes(1);
      expect(child.parentPost).toHaveBeenCalledWith(
        envelope({ kind: 'path-request' }),
        '*',
      );

      jest.advanceTimersByTime(500);
      expect(child.parentPost).toHaveBeenCalledTimes(2);

      child.dispatch(
        envelope({ kind: 'path', path: '#widget', role: SessionRoleEnum.Idle }),
        child.win.parent,
      );
      jest.advanceTimersByTime(5000);

      expect(bridge.path).toBe('#widget');
      expect(child.parentPost).toHaveBeenCalledTimes(2);
    });

    it('gives up asking after a while', () => {
      const child = makeChild();
      new FrameBridge(null, child.win);

      jest.advanceTimersByTime(60000);

      expect(child.parentPost).toHaveBeenCalledTimes(40);
    });

    it('only accepts a path from its parent, once', () => {
      const child = makeChild();
      const bridge = new FrameBridge(null, child.win);
      const listener = jest.fn();
      bridge.onResolved(listener);

      child.dispatch(
        envelope({ kind: 'path', path: '#evil', role: SessionRoleEnum.Source }),
        window,
      );
      expect(bridge.path).toBeNull();

      child.dispatch(
        envelope({ kind: 'path', path: 42, role: SessionRoleEnum.Source }),
        child.win.parent,
      );
      expect(bridge.path).toBeNull();

      child.dispatch(
        envelope({ kind: 'path', path: '#a', role: SessionRoleEnum.Target }),
        child.win.parent,
      );
      child.dispatch(
        envelope({ kind: 'path', path: '#b', role: SessionRoleEnum.Idle }),
        child.win.parent,
      );

      expect(bridge.path).toBe('#a');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('#a', SessionRoleEnum.Target);
    });

    it('forwards cursor positions to its parent', () => {
      const child = makeChild();
      const bridge = new FrameBridge(null, child.win);
      child.parentPost.mockClear();

      bridge.moveTo(5, 6);
      bridge.animateClick(7, 8);

      expect(child.parentPost).toHaveBeenCalledWith(
        envelope({ kind: 'cursor', action: 'move', x: 5, y: 6 }),
        '*',
      );
      expect(child.parentPost).toHaveBeenCalledWith(
        envelope({ kind: 'cursor', action: 'click', x: 7, y: 8 }),
        '*',
      );
    });

    it('relays a grandchild cursor upwards with its own iframe offset added', () => {
      const child = makeChild();
      new FrameBridge(null, child.win);
      child.parentPost.mockClear();
      const iframe = mountIframe('inner');

      child.dispatch(
        envelope({ kind: 'cursor', action: 'move', x: 1, y: 1 }),
        iframe.contentWindow,
      );

      expect(child.parentPost).toHaveBeenCalledWith(
        envelope({ kind: 'cursor', action: 'move', x: 101, y: 51 }),
        '*',
      );
    });

    it('answers grandchildren only once its own path is known, joined with the separator', () => {
      const child = makeChild();
      const bridge = new FrameBridge(null, child.win);
      const iframe = mountIframe('inner');
      const grandchildPost = jest.spyOn(iframe.contentWindow!, 'postMessage');

      child.dispatch(envelope({ kind: 'path-request' }), iframe.contentWindow);
      expect(grandchildPost).not.toHaveBeenCalled();

      child.dispatch(
        envelope({
          kind: 'path',
          path: '#outer',
          role: SessionRoleEnum.Replay,
        }),
        child.win.parent,
      );

      expect(bridge.path).toBe('#outer');
      expect(grandchildPost).toHaveBeenCalledWith(
        envelope({
          kind: 'path',
          path: `#outer${FRAME_PATH_SEPARATOR}#inner`,
          role: SessionRoleEnum.Replay,
        }),
        '*',
      );
    });
  });
});
