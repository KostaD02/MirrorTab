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
import {
  DomClickEventPayload,
  DomEventTypeEnum,
  DomInputEventPayload,
  DomKeyboardEventPayload,
  DomMousemoveEventPayload,
  DomScrollEventPayload,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import { EventCapture, EventReplay } from './mirror';
import { VirtualCursor } from './virtual-cursor';

jest.mock('@/shared/util', () => ({
  ...jest.requireActual('@/shared/util'),
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

const MOCK_DATE = new Date('2026-04-24T10:00:00.000Z');

function getLastDomEvent(): {
  type: string;
  selector: string;
  content: unknown;
  timestamp: string;
} | null {
  const calls = (chrome.runtime.sendMessage as jest.Mock).mock.calls;
  if (calls.length === 0) return null;
  const last = calls[calls.length - 1][0];
  if (last.type !== ExtensionMessageTypeEnum.DomEvent) return null;
  return last.payload;
}

describe('EventCapture', () => {
  // One instance for the whole file — EventCapture attaches listeners to
  // `document` and jsdom can't easily remove them between tests, so creating
  // a fresh instance per test would accumulate listeners and duplicate events.
  let capture: EventCapture;

  beforeAll(() => {
    capture = new EventCapture();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_DATE);
    document.body.innerHTML = '';
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(undefined);
    capture.setRole(SessionRoleEnum.Idle);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not send events while role is Idle', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    btn.click();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send events while role is Target', () => {
    capture.setRole(SessionRoleEnum.Target);
    const btn = document.createElement('button');
    document.body.appendChild(btn);

    btn.click();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  describe('when role is Source', () => {
    beforeEach(() => {
      capture.setRole(SessionRoleEnum.Source);
    });

    it('captures click events with ratio-based offsets and selector', () => {
      const btn = document.createElement('button');
      btn.id = 'my-btn';
      document.body.appendChild(btn);
      jest.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 50,
        width: 200,
        height: 40,
        right: 300,
        bottom: 90,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      } as DOMRect);

      btn.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: 150,
          clientY: 70,
        }),
      );

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Click);
      expect(payload?.selector).toBe('#my-btn');
      expect(payload?.content).toEqual({
        offsetXRatio: 0.25,
        offsetYRatio: 0.5,
      });
      expect(payload?.timestamp).toBe(MOCK_DATE.toISOString());
    });

    it('uses 0.5 offset when clicked element has zero size', () => {
      const span = document.createElement('span');
      span.id = 'zero';
      document.body.appendChild(span);
      jest.spyOn(span, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      span.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }),
      );

      const payload = getLastDomEvent();
      expect(payload?.content).toEqual({
        offsetXRatio: 0.5,
        offsetYRatio: 0.5,
      });
    });

    it('ignores clicks on the documentElement', () => {
      document.documentElement.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('captures input events with the element value', () => {
      const input = document.createElement('input');
      input.id = 'name';
      document.body.appendChild(input);
      input.value = 'hello';

      input.dispatchEvent(new Event('input', { bubbles: true }));

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Input);
      expect(payload?.selector).toBe('#name');
      expect((payload?.content as DomInputEventPayload).value).toBe('hello');
    });

    it('captures change events with the element value', () => {
      const select = document.createElement('select');
      select.id = 'pick';
      document.body.appendChild(select);
      const opt = document.createElement('option');
      opt.value = 'a';
      select.appendChild(opt);
      select.value = 'a';

      select.dispatchEvent(new Event('change', { bubbles: true }));

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Change);
      expect((payload?.content as DomInputEventPayload).value).toBe('a');
    });

    it('captures keydown events with all modifier flags', () => {
      const input = document.createElement('input');
      input.id = 'k';
      document.body.appendChild(input);

      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'a',
          code: 'KeyA',
          ctrlKey: true,
          shiftKey: true,
          altKey: false,
          metaKey: false,
        }),
      );

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Keydown);
      const content = payload?.content as DomKeyboardEventPayload;
      expect(content.key).toBe('a');
      expect(content.code).toBe('KeyA');
      expect(content.ctrlKey).toBe(true);
      expect(content.shiftKey).toBe(true);
      expect(content.altKey).toBe(false);
    });

    it('captures keyup events', () => {
      const input = document.createElement('input');
      input.id = 'k2';
      document.body.appendChild(input);

      input.dispatchEvent(
        new KeyboardEvent('keyup', { bubbles: true, key: 'b', code: 'KeyB' }),
      );

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Keyup);
    });

    it('debounces scroll events per selector and emits the latest position', () => {
      Object.defineProperty(window, 'scrollX', {
        value: 10,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, 'scrollY', {
        value: 20,
        writable: true,
        configurable: true,
      });

      document.dispatchEvent(new Event('scroll'));
      (window.scrollY as number) = 40;
      document.dispatchEvent(new Event('scroll'));

      // Still pending inside the 50ms window
      expect(getLastDomEvent()).toBeNull();

      jest.advanceTimersByTime(60);

      const payload = getLastDomEvent();
      expect(payload?.type).toBe(DomEventTypeEnum.Scroll);
      expect(payload?.selector).toBe('window');
      expect(payload?.content).toEqual({ scrollX: 10, scrollY: 40 });
    });

    it('captures element scrolls using the element selector and scrollLeft/scrollTop', () => {
      const div = document.createElement('div');
      div.id = 'scrollbox';
      Object.defineProperty(div, 'scrollLeft', {
        value: 5,
        configurable: true,
      });
      Object.defineProperty(div, 'scrollTop', {
        value: 15,
        configurable: true,
      });
      document.body.appendChild(div);

      div.dispatchEvent(new Event('scroll', { bubbles: true }));
      jest.advanceTimersByTime(60);

      const payload = getLastDomEvent();
      expect(payload?.selector).toBe('#scrollbox');
      expect(payload?.content).toEqual({ scrollX: 5, scrollY: 15 });
    });

    it('throttles mousemove with requestAnimationFrame', () => {
      const rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb) => {
          setTimeout(() => cb(0), 0);
          return 1;
        });
      Object.defineProperty(window, 'innerWidth', {
        value: 1000,
        configurable: true,
      });
      Object.defineProperty(window, 'innerHeight', {
        value: 500,
        configurable: true,
      });

      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 200, clientY: 250 }),
      );
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 600, clientY: 100 }),
      );

      jest.runAllTimers();

      const calls = (chrome.runtime.sendMessage as jest.Mock).mock.calls;
      const moveCalls = calls.filter(
        (c) => c[0].payload?.type === DomEventTypeEnum.Mousemove,
      );
      expect(moveCalls).toHaveLength(1);
      const content = moveCalls[0][0].payload
        .content as DomMousemoveEventPayload;
      expect(content.xRatio).toBeCloseTo(0.6);
      expect(content.yRatio).toBeCloseTo(0.2);

      rafSpy.mockRestore();
    });

    it('skips the scroll flush when role changes to Idle before timer fires', () => {
      document.dispatchEvent(new Event('scroll'));
      capture.setRole(SessionRoleEnum.Idle);

      jest.advanceTimersByTime(60);

      expect(getLastDomEvent()).toBeNull();
    });
  });
});

describe('EventReplay', () => {
  let replay: EventReplay;
  let cursor: VirtualCursor;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    cursor = new VirtualCursor();
    jest.spyOn(cursor, 'moveTo').mockImplementation(() => undefined);
    jest.spyOn(cursor, 'animateClick').mockImplementation(() => undefined);
    replay = new EventReplay(cursor);
  });

  const basePayload = {
    selector: '#root',
    timestamp: '2026-04-24T10:00:00.000Z',
  };

  it('replays a click by dispatching a MouseEvent and records with element meta', () => {
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);
    jest.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 40,
      right: 100,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const clickSpy = jest.fn();
    btn.addEventListener('click', clickSpy);

    const content: DomClickEventPayload = {
      offsetXRatio: 0.5,
      offsetYRatio: 0.5,
    };
    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content,
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(cursor.animateClick).toHaveBeenCalledWith(50, 20);
    expect(replay.sessionRecords).toHaveLength(1);
    expect(replay.sessionRecords[0].selector).toBe('button#root');
    expect(replay.sessionRecords[0].selectorStackTrace).toBe('#root');
  });

  it('replays input events using the native value setter so frameworks see the change', () => {
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const inputSpy = jest.fn();
    input.addEventListener('input', inputSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Input,
      content: { value: 'typed' } as DomInputEventPayload,
    });

    expect(input.value).toBe('typed');
    expect(inputSpy).toHaveBeenCalledTimes(1);
    expect(replay.sessionRecords[0].type).toBe(DomEventTypeEnum.Input);
  });

  it('replays change events by setting value and dispatching change', () => {
    const select = document.createElement('select');
    select.id = 'root';
    const a = document.createElement('option');
    a.value = 'a';
    const b = document.createElement('option');
    b.value = 'b';
    select.append(a, b);
    document.body.appendChild(select);
    const changeSpy = jest.fn();
    select.addEventListener('change', changeSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Change,
      content: { value: 'b' } as DomInputEventPayload,
    });

    expect(select.value).toBe('b');
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it('replays keydown and records it', () => {
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const kdSpy = jest.fn();
    input.addEventListener('keydown', kdSpy);

    const content: DomKeyboardEventPayload = {
      key: 'Enter',
      code: 'Enter',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    };
    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Keydown,
      content,
    });

    expect(kdSpy).toHaveBeenCalledTimes(1);
    expect(replay.sessionRecords[0].type).toBe(DomEventTypeEnum.Keydown);
  });

  it('replays keyup', () => {
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const kuSpy = jest.fn();
    input.addEventListener('keyup', kuSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Keyup,
      content: {
        key: 'a',
        code: 'KeyA',
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      } as DomKeyboardEventPayload,
    });

    expect(kuSpy).toHaveBeenCalledTimes(1);
  });

  it('scrolls the window when selector is "window"', () => {
    const scrollToSpy = jest
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: 'window',
      timestamp: basePayload.timestamp,
      content: { scrollX: 10, scrollY: 20 } as DomScrollEventPayload,
    });

    expect(scrollToSpy).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      behavior: 'smooth',
    });
    expect(replay.sessionRecords).toHaveLength(1);
  });

  it('scrolls a matched element when selector resolves', () => {
    const box = document.createElement('div');
    box.id = 'scroll';
    const elScrollSpy = jest.fn();
    (box as unknown as { scrollTo: typeof elScrollSpy }).scrollTo = elScrollSpy;
    document.body.appendChild(box);

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: '#scroll',
      timestamp: basePayload.timestamp,
      content: { scrollX: 5, scrollY: 15 } as DomScrollEventPayload,
    });

    expect(elScrollSpy).toHaveBeenCalledWith({
      left: 5,
      top: 15,
      behavior: 'smooth',
    });
  });

  it('logs a warning for scroll events when the selector is unknown', async () => {
    const logger = (await import('@/shared/util')).logger;

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: '#missing',
      timestamp: basePayload.timestamp,
      content: { scrollX: 0, scrollY: 0 } as DomScrollEventPayload,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      '[replay scroll] could not resolve element for selector:',
      '#missing',
    );
  });

  it('moves the virtual cursor on mousemove payloads', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 600,
      configurable: true,
    });

    replay.replay({
      type: DomEventTypeEnum.Mousemove,
      selector: 'window',
      timestamp: basePayload.timestamp,
      content: { xRatio: 0.4, yRatio: 0.5 } as DomMousemoveEventPayload,
    });

    expect(cursor.moveTo).toHaveBeenCalledWith(400, 300);
  });

  it('warns and bails out when the selector does not resolve (non-scroll)', async () => {
    const logger = (await import('@/shared/util')).logger;

    replay.replay({
      type: DomEventTypeEnum.Click,
      selector: '#does-not-exist',
      timestamp: basePayload.timestamp,
      content: { offsetXRatio: 0.5, offsetYRatio: 0.5 } as DomClickEventPayload,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not resolve selector: #does-not-exist',
    );
    expect(replay.sessionRecords).toHaveLength(0);
  });

  it('safely handles invalid selectors via try/catch', () => {
    expect(() => {
      replay.replay({
        type: DomEventTypeEnum.Click,
        selector: '))))invalid((((',
        timestamp: basePayload.timestamp,
        content: {
          offsetXRatio: 0.5,
          offsetYRatio: 0.5,
        } as DomClickEventPayload,
      });
    }).not.toThrow();
  });

  it('clear() empties stored records', () => {
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);
    jest.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 10,
      height: 10,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });
    expect(replay.sessionRecords).toHaveLength(1);
    replay.clear();
    expect(replay.sessionRecords).toHaveLength(0);
  });
});
