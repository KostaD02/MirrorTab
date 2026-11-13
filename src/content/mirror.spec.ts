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
  DomEventContent,
  DomEventType,
  DomEventTypeEnum,
  DomInputEventPayload,
  DomKeyboardEventPayload,
  DomMousemoveEventPayload,
  DomResizeEventPayload,
  DomScrollEventPayload,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRecord,
  SessionRoleEnum,
} from '@/shared/types';
import { FrameContext } from './frame-bridge';
import { EventCapture, EventReplay } from './mirror';
import { DEFAULT_SETTINGS } from '@/shared/consts';

jest.mock('@/shared/util', () => ({
  ...jest.requireActual('@/shared/util'),
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

const MOCK_DATE = new Date('2026-04-24T10:00:00.000Z');

interface DomEventPayloadLike {
  type: string;
  selector: string;
  framePath: string;
  content: unknown;
  timestamp: string;
}

function getLastDomEvent(): {
  type: string;
  selector: string;
  framePath: string;
  content: unknown;
  timestamp: string;
} | null {
  const calls = (chrome.runtime.sendMessage as jest.Mock).mock.calls;
  if (calls.length === 0) return null;
  const last = calls[calls.length - 1][0];
  if (last.type !== ExtensionMessageTypeEnum.DomEvent) return null;
  return last.payload;
}

type FrameStub = FrameContext & {
  path: string | null;
  moveTo: jest.Mock;
  animateClick: jest.Mock;
};

function makeFrame(path: string | null = ''): FrameStub {
  return { path, moveTo: jest.fn(), animateClick: jest.fn() };
}

function sentRecords(): SessionRecord[] {
  return (chrome.runtime.sendMessage as jest.Mock).mock.calls
    .map((c) => c[0] as ExtensionMessage)
    .filter((m) => m.type === ExtensionMessageTypeEnum.RecordEvent)
    .map((m) => (m as { payload: SessionRecord }).payload);
}

describe('EventCapture', () => {
  // One instance for the whole file — EventCapture attaches listeners to
  // `document` and jsdom can't easily remove them between tests, so creating
  // a fresh instance per test would accumulate listeners and duplicate events.
  let capture: EventCapture;
  const captureFrame = makeFrame();

  beforeAll(() => {
    capture = new EventCapture(captureFrame);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(MOCK_DATE);
    document.body.innerHTML = '';
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(undefined);
    capture.setRole(SessionRoleEnum.Idle);
    capture.setSettings({ ...DEFAULT_SETTINGS });
    captureFrame.path = '';
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

    it('sends the checked state of checkboxes and radios', () => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'agree';
      document.body.appendChild(box);
      box.checked = true;

      box.dispatchEvent(new Event('change', { bubbles: true }));

      expect(getLastDomEvent()).toMatchObject({
        type: DomEventTypeEnum.Change,
        selector: '#agree',
        content: { value: 'on', checked: true },
      });
    });

    it('sends the markup of a contenteditable element', () => {
      const note = document.createElement('div');
      note.id = 'note';
      note.contentEditable = 'true';
      note.innerHTML = 'Hello <i>there</i>';
      document.body.appendChild(note);

      note.dispatchEvent(new Event('input', { bubbles: true }));

      expect(getLastDomEvent()?.content).toEqual({
        value: 'Hello there',
        html: 'Hello <i>there</i>',
      });
    });

    it('reports a textarea whose inline size changed', async () => {
      const area = document.createElement('textarea');
      area.id = 'bio';
      document.body.appendChild(area);

      area.style.width = '300px';
      area.style.height = '120px';
      await Promise.resolve();
      jest.advanceTimersByTime(100);

      expect(getLastDomEvent()).toMatchObject({
        type: DomEventTypeEnum.Resize,
        selector: '#bio',
        content: { width: '300px', height: '120px' },
      });
    });

    it('addresses elements inside an open shadow root through their host', () => {
      const host = document.createElement('div');
      host.id = 'host';
      document.body.appendChild(host);
      const button = document.createElement('button');
      button.id = 'inner';
      host.attachShadow({ mode: 'open' }).appendChild(button);

      button.dispatchEvent(
        new MouseEvent('click', { bubbles: true, composed: true }),
      );

      expect(getLastDomEvent()?.selector).toBe('#host >>> #inner');
    });

    it('captures focus and blur with the element selector', () => {
      const input = document.createElement('input');
      input.id = 'name';
      document.body.appendChild(input);

      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(getLastDomEvent()).toMatchObject({
        type: DomEventTypeEnum.Focus,
        selector: '#name',
        content: { visible: expect.any(Boolean) },
      });

      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(getLastDomEvent()?.type).toBe(DomEventTypeEnum.Blur);
    });

    it('tags every event with the frame path', () => {
      captureFrame.path = 'iframe#widget';
      const btn = document.createElement('button');
      document.body.appendChild(btn);

      btn.click();

      expect(getLastDomEvent()?.framePath).toBe('iframe#widget');
    });

    it('does not send events while the frame path is unresolved', () => {
      captureFrame.path = null;
      const btn = document.createElement('button');
      document.body.appendChild(btn);

      btn.click();

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    describe('gestures', () => {
      function addBox(id: string): HTMLElement {
        const box = document.createElement('div');
        box.id = id;
        document.body.appendChild(box);
        jest.spyOn(box, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          right: 100,
          bottom: 50,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect);
        return box;
      }

      // jsdom has no DataTransfer, so a drag or paste carries this stand-in
      function transferStub(
        data: Record<string, string>,
        extra: Record<string, unknown> = {},
      ): DataTransfer {
        return {
          types: Object.keys(data),
          files: [],
          effectAllowed: 'none',
          dropEffect: 'none',
          getData: (type: string) => data[type] ?? '',
          ...extra,
        } as unknown as DataTransfer;
      }

      function dragEvent(
        type: string,
        transfer: DataTransfer | null,
        clientX = 50,
        clientY = 25,
      ): Event {
        const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
        Object.defineProperty(event, 'dataTransfer', { value: transfer });
        return event;
      }

      function pasteEvent(data: Record<string, string>): Event {
        const event = new Event('paste', { bubbles: true });
        Object.defineProperty(event, 'clipboardData', {
          value: transferStub(data),
        });
        return event;
      }

      function eventsOfType(type: DomEventType): DomEventPayloadLike[] {
        return (chrome.runtime.sendMessage as jest.Mock).mock.calls
          .map((call) => call[0] as ExtensionMessage)
          .filter(
            (message) => message.type === ExtensionMessageTypeEnum.DomEvent,
          )
          .map(
            (message) => (message as { payload: DomEventPayloadLike }).payload,
          )
          .filter((payload) => payload.type === type);
      }

      function onNextFrame(): jest.SpyInstance {
        return jest
          .spyOn(window, 'requestAnimationFrame')
          .mockImplementation((cb) => {
            setTimeout(() => cb(0), 0);
            return 1;
          });
      }

      it('captures a double click with ratio offsets', () => {
        addBox('card').dispatchEvent(
          new MouseEvent('dblclick', {
            bubbles: true,
            clientX: 50,
            clientY: 25,
          }),
        );

        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Dblclick,
          selector: '#card',
          content: { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        });
      });

      it('captures a right click', () => {
        addBox('card').dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX: 25,
            clientY: 25,
          }),
        );

        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Contextmenu,
          selector: '#card',
          content: { offsetXRatio: 0.25, offsetYRatio: 0.5 },
        });
      });

      it('sums the wheel deltas of a frame into one event per element', () => {
        const raf = onNextFrame();
        const box = addBox('list');

        box.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            deltaY: 40,
            clientX: 50,
            clientY: 25,
          }),
        );
        box.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            deltaY: 60,
            clientX: 50,
            clientY: 25,
          }),
        );
        jest.runAllTimers();

        const wheels = eventsOfType(DomEventTypeEnum.Wheel);
        expect(wheels).toHaveLength(1);
        expect(wheels[0].selector).toBe('#list');
        expect(wheels[0].content).toMatchObject({
          deltaX: 0,
          deltaY: 100,
          deltaMode: 0,
          offsetXRatio: 0.5,
        });

        raf.mockRestore();
      });

      it('skips the wheel when scrolling is not mirrored', () => {
        const raf = onNextFrame();
        capture.setSettings({ ...DEFAULT_SETTINGS, mirrorScroll: false });

        addBox('list').dispatchEvent(
          new WheelEvent('wheel', { bubbles: true, deltaY: 40 }),
        );
        jest.runAllTimers();

        expect(getLastDomEvent()).toBeNull();
        raf.mockRestore();
      });

      it('captures a dragstart with the dragged payload, minus the files', () => {
        addBox('chip').dispatchEvent(
          dragEvent(
            'dragstart',
            transferStub(
              { 'text/plain': 'task-7', Files: '' },
              { effectAllowed: 'copyMove' },
            ),
          ),
        );

        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Dragstart,
          selector: '#chip',
          content: {
            types: ['text/plain', 'Files'],
            data: { 'text/plain': 'task-7' },
            effectAllowed: 'copyMove',
            offsetXRatio: 0.5,
          },
        });
      });

      it('coalesces dragover to the latest position of the frame', () => {
        const raf = onNextFrame();
        const zone = addBox('zone');

        zone.dispatchEvent(dragEvent('dragover', null, 25, 25));
        zone.dispatchEvent(dragEvent('dragover', null, 75, 25));
        jest.runAllTimers();

        const overs = eventsOfType(DomEventTypeEnum.Dragover);
        expect(overs).toHaveLength(1);
        expect(overs[0].content).toEqual({
          offsetXRatio: 0.75,
          offsetYRatio: 0.5,
        });

        raf.mockRestore();
      });

      it('sends the last dragover before the drop that follows it', () => {
        const raf = onNextFrame();
        const zone = addBox('zone');

        zone.dispatchEvent(dragEvent('dragover', null, 75, 25));
        zone.dispatchEvent(
          dragEvent('drop', transferStub({ 'text/plain': 'task-7' })),
        );
        jest.runAllTimers();

        const order = (chrome.runtime.sendMessage as jest.Mock).mock.calls
          .map((call) => call[0] as ExtensionMessage)
          .filter(
            (message) => message.type === ExtensionMessageTypeEnum.DomEvent,
          )
          .map(
            (message) =>
              (message as { payload: DomEventPayloadLike }).payload.type,
          );

        expect(order).toEqual([
          DomEventTypeEnum.Dragover,
          DomEventTypeEnum.Drop,
        ]);

        raf.mockRestore();
      });

      it('captures a drop with its payload and a dragend without one', () => {
        const zone = addBox('zone');

        zone.dispatchEvent(
          dragEvent(
            'drop',
            transferStub({ 'text/plain': 'task-7' }, { dropEffect: 'move' }),
          ),
        );
        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Drop,
          content: { data: { 'text/plain': 'task-7' }, dropEffect: 'move' },
        });

        zone.dispatchEvent(
          dragEvent('dragend', transferStub({ 'text/plain': 'task-7' })),
        );
        const payload = getLastDomEvent();
        expect(payload?.type).toBe(DomEventTypeEnum.Dragend);
        expect(payload?.content).toEqual({
          offsetXRatio: 0.5,
          offsetYRatio: 0.5,
        });
      });

      it('captures pasted text and markup', () => {
        const field = document.createElement('textarea');
        field.id = 'note';
        document.body.appendChild(field);

        field.dispatchEvent(
          pasteEvent({
            'text/plain': 'from the clipboard',
            'text/html': '<b>from</b>',
          }),
        );

        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Paste,
          selector: '#note',
          content: { text: 'from the clipboard', html: '<b>from</b>' },
        });
      });

      it('skips a paste when the clipboard setting is off', () => {
        capture.setSettings({ ...DEFAULT_SETTINGS, mirrorClipboard: false });
        const field = document.createElement('textarea');
        document.body.appendChild(field);

        field.dispatchEvent(pasteEvent({ 'text/plain': 'secret' }));

        expect(getLastDomEvent()).toBeNull();
      });

      it('skips a paste into a password field when opted out', () => {
        capture.setSettings({
          ...DEFAULT_SETTINGS,
          mirrorPasswordFields: false,
        });
        const field = document.createElement('input');
        field.type = 'password';
        document.body.appendChild(field);

        field.dispatchEvent(pasteEvent({ 'text/plain': 'hunter2' }));

        expect(getLastDomEvent()).toBeNull();
      });

      it('captures a field selection once it settles', () => {
        const field = document.createElement('input');
        field.id = 'title';
        field.value = 'release notes';
        document.body.appendChild(field);
        field.setSelectionRange(0, 7);

        field.dispatchEvent(new Event('select', { bubbles: true }));
        expect(getLastDomEvent()).toBeNull();

        jest.advanceTimersByTime(150);
        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Selection,
          selector: '#title',
          content: { start: 0, end: 7 },
        });
      });

      it('captures a page selection as anchor and focus points', () => {
        const para = document.createElement('p');
        para.id = 'intro';
        para.textContent = 'mirror every gesture';
        document.body.appendChild(para);
        const text = para.firstChild as Text;
        document.getSelection()?.setBaseAndExtent(text, 0, text, 6);

        document.dispatchEvent(new Event('selectionchange'));
        jest.advanceTimersByTime(150);

        expect(getLastDomEvent()).toMatchObject({
          type: DomEventTypeEnum.Selection,
          selector: '#intro',
          content: {
            anchor: { selector: '#intro', childIndex: 0, offset: 0 },
            focus: { selector: '#intro', childIndex: 0, offset: 6 },
          },
        });
      });

      it('asks the target to clear a dropped selection just once', () => {
        const para = document.createElement('p');
        para.id = 'intro';
        para.textContent = 'mirror every gesture';
        document.body.appendChild(para);
        const text = para.firstChild as Text;

        document.getSelection()?.setBaseAndExtent(text, 0, text, 6);
        document.dispatchEvent(new Event('selectionchange'));
        jest.advanceTimersByTime(150);
        expect(getLastDomEvent()?.type).toBe(DomEventTypeEnum.Selection);

        document.getSelection()?.removeAllRanges();
        document.dispatchEvent(new Event('selectionchange'));
        jest.advanceTimersByTime(150);
        expect(getLastDomEvent()).toMatchObject({
          selector: '#intro',
          content: { collapsed: true },
        });

        // nothing is selected any more, so a further change is not worth a message
        jest.clearAllMocks();
        document.dispatchEvent(new Event('selectionchange'));
        jest.advanceTimersByTime(150);
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      });
    });

    describe('settings', () => {
      function addPasswordField(): HTMLInputElement {
        const field = document.createElement('input');
        field.type = 'password';
        field.id = 'pw';
        field.value = 'hunter2';
        document.body.appendChild(field);
        return field;
      }

      function optOutOfPasswords(): void {
        capture.setSettings({
          ...DEFAULT_SETTINGS,
          mirrorPasswordFields: false,
        });
      }

      it('does not capture input from a password field when opted out', () => {
        optOutOfPasswords();
        const field = addPasswordField();

        field.dispatchEvent(new Event('input', { bubbles: true }));

        expect(getLastDomEvent()).toBeNull();
      });

      it('does not capture change from a password field when opted out', () => {
        optOutOfPasswords();
        const field = addPasswordField();

        field.dispatchEvent(new Event('change', { bubbles: true }));

        expect(getLastDomEvent()).toBeNull();
      });

      it('does not capture keystrokes in a password field when opted out', () => {
        optOutOfPasswords();
        const field = addPasswordField();

        field.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'h', bubbles: true }),
        );
        field.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'h', bubbles: true }),
        );

        expect(getLastDomEvent()).toBeNull();
      });

      it('captures password fields by default', () => {
        const field = addPasswordField();

        field.dispatchEvent(new Event('input', { bubbles: true }));

        const payload = getLastDomEvent();
        expect(payload?.type).toBe(DomEventTypeEnum.Input);
        expect((payload?.content as DomInputEventPayload).value).toBe(
          'hunter2',
        );
      });

      it('still captures input from ordinary fields', () => {
        const field = document.createElement('input');
        field.type = 'text';
        field.id = 'plain';
        field.value = 'hello';
        document.body.appendChild(field);

        field.dispatchEvent(new Event('input', { bubbles: true }));

        expect(getLastDomEvent()?.type).toBe(DomEventTypeEnum.Input);
      });

      it('skips mousemove when the setting is off', () => {
        capture.setSettings({ ...DEFAULT_SETTINGS, mirrorMousemove: false });

        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 10, clientY: 10 }),
        );

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      });

      it('skips scroll when the setting is off', () => {
        capture.setSettings({ ...DEFAULT_SETTINGS, mirrorScroll: false });

        document.dispatchEvent(new Event('scroll'));
        jest.advanceTimersByTime(200);

        expect(getLastDomEvent()).toBeNull();
      });

      it('skips keystrokes when the setting is off', () => {
        capture.setSettings({ ...DEFAULT_SETTINGS, mirrorKeystrokes: false });
        const field = document.createElement('input');
        document.body.appendChild(field);

        field.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
        );
        field.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'a', bubbles: true }),
        );

        expect(getLastDomEvent()).toBeNull();
      });

      it('honours a custom scroll debounce', () => {
        capture.setSettings({ ...DEFAULT_SETTINGS, scrollDebounceMs: 300 });

        document.dispatchEvent(new Event('scroll'));

        jest.advanceTimersByTime(100);
        expect(getLastDomEvent()).toBeNull();

        jest.advanceTimersByTime(250);
        expect(getLastDomEvent()?.type).toBe(DomEventTypeEnum.Scroll);
      });
    });
  });
});

describe('EventReplay', () => {
  let replay: EventReplay;
  let frame: FrameStub;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(undefined);
    // jsdom has no layout, so the element under the cursor is whatever a test says it is
    Object.defineProperty(document, 'elementFromPoint', {
      value: jest.fn(() => null),
      configurable: true,
      writable: true,
    });
    frame = makeFrame();
    replay = new EventReplay(frame);
  });

  const atPoint = (el: Element | null) => {
    (document.elementFromPoint as jest.Mock).mockReturnValue(el);
  };

  const mousemove = (xRatio: number, yRatio: number) => {
    replay.replay({
      type: DomEventTypeEnum.Mousemove,
      selector: 'window',
      framePath: '',
      timestamp: basePayload.timestamp,
      content: { xRatio, yRatio } as DomMousemoveEventPayload,
    });
  };

  const basePayload = {
    selector: '#root',
    framePath: '',
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
    expect(frame.animateClick).toHaveBeenCalledWith(50, 20);
    expect(sentRecords()).toHaveLength(1);
    expect(sentRecords()[0].selector).toBe('button#root');
    expect(sentRecords()[0].selectorStackTrace).toBe('#root');
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
    expect(sentRecords()[0].type).toBe(DomEventTypeEnum.Input);
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
    expect(sentRecords()[0].type).toBe(DomEventTypeEnum.Keydown);
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
      framePath: '',
      content: { scrollX: 10, scrollY: 20 } as DomScrollEventPayload,
    });

    expect(scrollToSpy).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      behavior: 'smooth',
    });
    expect(sentRecords()).toHaveLength(1);
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
      framePath: '',
      content: { scrollX: 5, scrollY: 15 } as DomScrollEventPayload,
    });

    expect(elScrollSpy).toHaveBeenCalledWith({
      left: 5,
      top: 15,
      behavior: 'smooth',
    });
  });

  it('jumps instantly when smooth scrolling is disabled', () => {
    const scrollToSpy = jest
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    replay.setSettings({ ...DEFAULT_SETTINGS, smoothScroll: false });

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: 'window',
      timestamp: basePayload.timestamp,
      framePath: '',
      content: { scrollX: 10, scrollY: 20 } as DomScrollEventPayload,
    });

    expect(scrollToSpy).toHaveBeenCalledWith({
      left: 10,
      top: 20,
      behavior: 'auto',
    });
  });

  it('jumps an element instantly when smooth scrolling is disabled', () => {
    const box = document.createElement('div');
    box.id = 'scroll';
    const elScrollSpy = jest.fn();
    (box as unknown as { scrollTo: typeof elScrollSpy }).scrollTo = elScrollSpy;
    document.body.appendChild(box);
    replay.setSettings({ ...DEFAULT_SETTINGS, smoothScroll: false });

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: '#scroll',
      timestamp: basePayload.timestamp,
      framePath: '',
      content: { scrollX: 5, scrollY: 15 } as DomScrollEventPayload,
    });

    expect(elScrollSpy).toHaveBeenCalledWith({
      left: 5,
      top: 15,
      behavior: 'auto',
    });
  });

  it('logs a warning for scroll events when the selector is unknown', async () => {
    const logger = (await import('@/shared/util')).logger;

    replay.replay({
      type: DomEventTypeEnum.Scroll,
      selector: '#missing',
      timestamp: basePayload.timestamp,
      framePath: '',
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
      framePath: '',
      content: { xRatio: 0.4, yRatio: 0.5 } as DomMousemoveEventPayload,
    });

    expect(frame.moveTo).toHaveBeenCalledWith(400, 300);
  });

  it('warns and bails out when the selector does not resolve (non-scroll)', async () => {
    const logger = (await import('@/shared/util')).logger;

    replay.replay({
      type: DomEventTypeEnum.Click,
      selector: '#does-not-exist',
      timestamp: basePayload.timestamp,
      framePath: '',
      content: { offsetXRatio: 0.5, offsetYRatio: 0.5 } as DomClickEventPayload,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not resolve selector: #does-not-exist',
    );
    expect(sentRecords()).toHaveLength(0);
  });

  it('safely handles invalid selectors via try/catch', () => {
    expect(() => {
      replay.replay({
        type: DomEventTypeEnum.Click,
        selector: '))))invalid((((',
        timestamp: basePayload.timestamp,
        framePath: '',
        content: {
          offsetXRatio: 0.5,
          offsetYRatio: 0.5,
        } as DomClickEventPayload,
      });
    }).not.toThrow();
  });

  it('replays a click as a full press: pointer and mouse down, focus, up, click', () => {
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);
    const order: string[] = [];
    for (const type of [
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]) {
      btn.addEventListener(type, () => order.push(type));
    }

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(order).toEqual([
      'pointerdown',
      'mousedown',
      'focus',
      'pointerup',
      'mouseup',
      'click',
    ]);
    expect(document.activeElement).toBe(btn);
  });

  it('focuses the nearest focusable ancestor when a child is clicked', () => {
    const btn = document.createElement('button');
    const icon = document.createElement('span');
    icon.id = 'root';
    btn.appendChild(icon);
    document.body.appendChild(btn);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(document.activeElement).toBe(btn);
  });

  it('replays focus and blur on the element and records them', () => {
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: {},
    });
    expect(document.activeElement).toBe(input);

    replay.replay({ ...basePayload, type: DomEventTypeEnum.Blur, content: {} });
    expect(document.activeElement).toBe(document.body);

    expect(sentRecords().map((r) => r.type)).toEqual([
      DomEventTypeEnum.Focus,
      DomEventTypeEnum.Blur,
    ]);
    expect(sentRecords()[0].selector).toBe('input#root');
  });

  it('does not blur an element that is not focused', () => {
    const input = document.createElement('input');
    input.id = 'root';
    const other = document.createElement('input');
    document.body.append(input, other);
    other.focus();

    replay.replay({ ...basePayload, type: DomEventTypeEnum.Blur, content: {} });

    expect(document.activeElement).toBe(other);
  });

  it('raises hover and move events on whatever sits under the cursor', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1000,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 1000,
      configurable: true,
    });
    const box = document.createElement('div');
    const inner = document.createElement('span');
    box.appendChild(inner);
    document.body.appendChild(box);
    const seen: string[] = [];
    const watch = (el: Element, name: string) => {
      for (const type of [
        'mouseover',
        'mouseenter',
        'mousemove',
        'mouseout',
        'mouseleave',
      ]) {
        el.addEventListener(type, (e) => {
          if (
            e.target === el ||
            (!type.includes('enter') && !type.includes('leave'))
          ) {
            seen.push(`${name}:${type}`);
          }
        });
      }
    };
    watch(box, 'box');
    watch(inner, 'inner');

    atPoint(inner);
    mousemove(0.1, 0.1);
    expect(seen).toEqual([
      'inner:mouseover',
      'box:mouseover',
      'box:mouseenter',
      'inner:mouseenter',
      'inner:mousemove',
      'box:mousemove',
    ]);
    expect(frame.moveTo).toHaveBeenCalledWith(100, 100);

    seen.length = 0;
    atPoint(box);
    mousemove(0.2, 0.2);
    expect(seen).toEqual([
      'inner:mouseout',
      'box:mouseout',
      'inner:mouseleave',
      'box:mouseover',
      'box:mousemove',
    ]);

    seen.length = 0;
    atPoint(null);
    mousemove(0.9, 0.9);
    expect(seen).toEqual(['box:mouseout', 'box:mouseleave']);
  });

  it('does not let the click toggle a checkbox; the change event carries the state', () => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'root';
    document.body.appendChild(box);
    const clickSpy = jest.fn();
    box.addEventListener('click', clickSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(box.checked).toBe(false);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Change,
      content: { value: 'on', checked: true } as DomInputEventPayload,
    });
    expect(box.checked).toBe(true);
    expect(sentRecords()[1].content).toEqual({ value: 'on', checked: true });
  });

  it('does not let a label click toggle its checkbox either', () => {
    const label = document.createElement('label');
    label.id = 'root';
    const box = document.createElement('input');
    box.type = 'checkbox';
    label.append(box, document.createTextNode('agree'));
    document.body.appendChild(label);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(box.checked).toBe(false);
  });

  it('selects a radio from its change event', () => {
    const a = document.createElement('input');
    a.type = 'radio';
    a.name = 'theme';
    a.checked = true;
    const b = document.createElement('input');
    b.type = 'radio';
    b.name = 'theme';
    b.id = 'root';
    document.body.append(a, b);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Change,
      content: { value: 'on', checked: true } as DomInputEventPayload,
    });

    expect(b.checked).toBe(true);
    expect(a.checked).toBe(false);
  });

  it('sets contenteditable markup from input events', () => {
    const note = document.createElement('div');
    note.id = 'root';
    note.contentEditable = 'true';
    document.body.appendChild(note);
    const inputSpy = jest.fn();
    note.addEventListener('input', inputSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Input,
      content: { value: 'bold', html: '<b>bold</b>' } as DomInputEventPayload,
    });

    expect(note.innerHTML).toBe('<b>bold</b>');
    expect(inputSpy).toHaveBeenCalledTimes(1);
  });

  it('applies the inline size from resize events', () => {
    const area = document.createElement('textarea');
    area.id = 'root';
    document.body.appendChild(area);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Resize,
      content: { width: '320px', height: '140px' } as DomResizeEventPayload,
    });

    expect(area.style.width).toBe('320px');
    expect(area.style.height).toBe('140px');
    expect(sentRecords()[0].type).toBe(DomEventTypeEnum.Resize);
  });

  it('raises focus and blur events by hand while the window is unfocused', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const seen: string[] = [];
    for (const type of ['focus', 'focusin', 'blur', 'focusout']) {
      input.addEventListener(type, () => seen.push(type));
    }

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: {},
    });
    // ? jsdom fires its own focus events even without window focus, Chrome does not; the second pair is ours
    expect(document.activeElement).toBe(input);
    expect(seen.filter((t) => t === 'focus')).toHaveLength(2);
    expect(seen.filter((t) => t === 'focusin')).toHaveLength(2);

    replay.replay({ ...basePayload, type: DomEventTypeEnum.Blur, content: {} });
    expect(seen.filter((t) => t === 'blur')).toHaveLength(2);
    expect(seen.filter((t) => t === 'focusout')).toHaveLength(2);
  });

  it('leaves focus events to the browser while the window is focused', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const focusSpy = jest.fn();
    input.addEventListener('focusin', focusSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: {},
    });

    expect(document.activeElement).toBe(input);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('tells the pseudo style target about hover and focus', () => {
    const pseudo = {
      setHover: jest.fn(),
      setFocus: jest.fn(),
      reset: jest.fn(),
    };
    const styled = new EventReplay(frame, pseudo);
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    Object.defineProperty(window, 'innerWidth', {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 100,
      configurable: true,
    });

    atPoint(input);
    styled.replay({
      type: DomEventTypeEnum.Mousemove,
      selector: 'window',
      framePath: '',
      timestamp: basePayload.timestamp,
      content: { xRatio: 0.5, yRatio: 0.5 } as DomMousemoveEventPayload,
    });
    expect(pseudo.setHover).toHaveBeenCalledWith(input);

    styled.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: {},
    });
    expect(pseudo.setFocus).toHaveBeenCalledWith(input, true);

    styled.replay({ ...basePayload, type: DomEventTypeEnum.Blur, content: {} });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(null, false);
  });

  it('resolves and replays inside an open shadow root', () => {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    const button = document.createElement('button');
    button.id = 'inner';
    host.attachShadow({ mode: 'open' }).appendChild(button);
    const clickSpy = jest.fn();
    button.addEventListener('click', clickSpy);

    replay.replay({
      ...basePayload,
      selector: '#host >>> #inner',
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('re-reads the hovered element when a scroll settles under the cursor', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 100,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 100,
      configurable: true,
    });
    const first = document.createElement('div');
    const second = document.createElement('div');
    document.body.append(first, second);
    const overSpy = jest.fn();
    second.addEventListener('mouseover', overSpy);

    atPoint(first);
    mousemove(0.5, 0.5);
    atPoint(second);
    document.dispatchEvent(new Event('scrollend'));

    // ? every EventReplay built in this file still listens on the shared document, so only the latest is asserted
    expect(overSpy).toHaveBeenCalled();
    expect(document.elementFromPoint).toHaveBeenLastCalledWith(50, 50);
  });

  it('mirrors the focus-visible verdict of the source and falls back by element kind', () => {
    const pseudo = {
      setHover: jest.fn(),
      setFocus: jest.fn(),
      reset: jest.fn(),
    };
    const styled = new EventReplay(frame, pseudo);
    const button = document.createElement('button');
    button.id = 'root';
    document.body.appendChild(button);

    styled.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: { visible: false },
    });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(button, false);

    styled.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: { visible: true },
    });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(button, true);

    styled.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: {},
    });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(button, false);
    expect(sentRecords().map((r) => r.content)).toEqual([
      { visible: false },
      { visible: true },
      { visible: false },
    ]);
  });

  it('treats a clicked text field as focus-visible but a clicked button not', () => {
    const pseudo = {
      setHover: jest.fn(),
      setFocus: jest.fn(),
      reset: jest.fn(),
    };
    const styled = new EventReplay(frame, pseudo);
    const input = document.createElement('input');
    input.id = 'root';
    const button = document.createElement('button');
    button.id = 'btn';
    document.body.append(input, button);

    styled.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(input, true);

    styled.replay({
      ...basePayload,
      selector: '#btn',
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });
    expect(pseudo.setFocus).toHaveBeenLastCalledWith(button, false);
  });

  it('does not focus again on click when the focus event already did', () => {
    const input = document.createElement('input');
    input.id = 'root';
    document.body.appendChild(input);
    const focusSpy = jest.fn();
    input.addEventListener('focus', focusSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Focus,
      content: { visible: true },
    });
    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('records carry the frame path of the event', () => {
    frame.path = 'iframe#widget';
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);

    replay.replay({
      ...basePayload,
      framePath: 'iframe#widget',
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(sentRecords()).toHaveLength(1);
    expect(sentRecords()[0].framePath).toBe('iframe#widget');
  });

  it('ignores events that belong to another frame', () => {
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);
    const clickSpy = jest.fn();
    btn.addEventListener('click', clickSpy);

    replay.replay({
      ...basePayload,
      framePath: 'iframe#other',
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(clickSpy).not.toHaveBeenCalled();
    expect(frame.animateClick).not.toHaveBeenCalled();
    expect(sentRecords()).toHaveLength(0);
  });

  it('ignores every event while its own frame path is unresolved', () => {
    frame.path = null;
    const btn = document.createElement('button');
    btn.id = 'root';
    document.body.appendChild(btn);
    const clickSpy = jest.fn();
    btn.addEventListener('click', clickSpy);

    replay.replay({
      ...basePayload,
      type: DomEventTypeEnum.Click,
      content: { offsetXRatio: 0, offsetYRatio: 0 } as DomClickEventPayload,
    });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  describe('gestures', () => {
    function addBox(id: string): HTMLElement {
      const box = document.createElement('div');
      box.id = id;
      document.body.appendChild(box);
      jest.spyOn(box, 'getBoundingClientRect').mockReturnValue({
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
      return box;
    }

    function play(
      type: DomEventType,
      content: DomEventContent,
      selector = '#root',
    ): void {
      replay.replay({ ...basePayload, selector, type, content });
    }

    it('replays a double click as one dblclick and records it', () => {
      const box = addBox('root');
      const details: number[] = [];
      box.addEventListener('dblclick', (e) => {
        details.push(e.detail);
      });

      play(DomEventTypeEnum.Dblclick, {
        offsetXRatio: 0.5,
        offsetYRatio: 0.5,
      });

      expect(details).toEqual([2]);
      expect(frame.animateClick).toHaveBeenCalledWith(50, 20);
      expect(sentRecords()[0]).toMatchObject({
        type: DomEventTypeEnum.Dblclick,
        selector: 'div#root',
        content: { offsetXRatio: 0.5, offsetYRatio: 0.5 },
      });
    });

    it('replays a right click as the whole secondary-button gesture', () => {
      const box = addBox('root');
      const seen: string[] = [];
      for (const type of ['mousedown', 'contextmenu', 'mouseup']) {
        box.addEventListener(type, (e) => {
          seen.push(type + ':' + String((e as MouseEvent).button));
        });
      }

      play(DomEventTypeEnum.Contextmenu, {
        offsetXRatio: 0.5,
        offsetYRatio: 0.5,
      });

      expect(seen).toEqual(['mousedown:2', 'contextmenu:2', 'mouseup:2']);
    });

    it('replays a wheel turn with its deltas and modifiers', () => {
      const box = addBox('root');
      const seen: WheelEvent[] = [];
      box.addEventListener('wheel', (e) => {
        seen.push(e);
      });

      play(DomEventTypeEnum.Wheel, {
        offsetXRatio: 0.5,
        offsetYRatio: 0.5,
        deltaX: 0,
        deltaY: 120,
        deltaZ: 0,
        deltaMode: 0,
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      });

      expect(seen).toHaveLength(1);
      expect(seen[0].deltaY).toBe(120);
      expect(seen[0].ctrlKey).toBe(true);
      expect(seen[0].clientX).toBe(50);
    });

    it('replays a drag as enter, over, drop and end carrying the payload', () => {
      const chip = addBox('chip');
      const zone = addBox('zone');
      const seen: string[] = [];
      const log = (e: Event) => {
        const transfer = (e as DragEvent).dataTransfer;
        seen.push(e.type + ':' + (transfer?.getData('text/plain') ?? ''));
      };
      for (const type of [
        'dragstart',
        'dragenter',
        'dragover',
        'dragleave',
        'drop',
        'dragend',
      ]) {
        chip.addEventListener(type, log);
        zone.addEventListener(type, log);
      }

      play(
        DomEventTypeEnum.Dragstart,
        {
          offsetXRatio: 0.5,
          offsetYRatio: 0.5,
          data: { 'text/plain': 'task-7' },
          effectAllowed: 'move',
        },
        '#chip',
      );
      play(
        DomEventTypeEnum.Dragover,
        { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        '#zone',
      );
      play(
        DomEventTypeEnum.Dragover,
        { offsetXRatio: 0.6, offsetYRatio: 0.5 },
        '#zone',
      );
      play(
        DomEventTypeEnum.Drop,
        { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        '#zone',
      );
      play(
        DomEventTypeEnum.Dragend,
        { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        '#chip',
      );

      // ? dragenter fires once: the second dragover is over the same element
      expect(seen).toEqual([
        'dragstart:task-7',
        'dragenter:task-7',
        'dragover:task-7',
        'dragover:task-7',
        'drop:task-7',
        'dragend:task-7',
      ]);
      expect(frame.moveTo).toHaveBeenCalledWith(50, 20);
    });

    it('leaves the element the drag left', () => {
      const first = addBox('first');
      const second = addBox('second');
      const seen: string[] = [];
      for (const type of ['dragenter', 'dragleave']) {
        first.addEventListener(type, (e) => {
          seen.push('first:' + e.type);
        });
        second.addEventListener(type, (e) => {
          seen.push('second:' + e.type);
        });
      }

      play(
        DomEventTypeEnum.Dragover,
        { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        '#first',
      );
      play(
        DomEventTypeEnum.Dragover,
        { offsetXRatio: 0.5, offsetYRatio: 0.5 },
        '#second',
      );

      expect(seen).toEqual([
        'first:dragenter',
        'first:dragleave',
        'second:dragenter',
      ]);
    });

    it('replays a paste without inserting the text itself', () => {
      const field = document.createElement('textarea');
      field.id = 'root';
      document.body.appendChild(field);
      const seen: string[] = [];
      field.addEventListener('paste', (e) => {
        seen.push(
          (e as ClipboardEvent).clipboardData?.getData('text/plain') ?? '',
        );
      });

      play(DomEventTypeEnum.Paste, { text: 'from the clipboard' });

      expect(seen).toEqual(['from the clipboard']);
      // ? the value arrives as its own input event, so the paste must not insert it twice
      expect(field.value).toBe('');
    });

    it('replays a field selection through the field itself', () => {
      const field = document.createElement('input');
      field.id = 'root';
      field.value = 'release notes';
      document.body.appendChild(field);

      play(DomEventTypeEnum.Selection, {
        start: 0,
        end: 7,
        direction: 'forward',
      });

      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(7);
    });

    it('replays a page selection and clears it again', () => {
      const para = document.createElement('p');
      para.id = 'root';
      para.textContent = 'mirror every gesture';
      document.body.appendChild(para);

      play(DomEventTypeEnum.Selection, {
        anchor: { selector: '#root', childIndex: 0, offset: 0 },
        focus: { selector: '#root', childIndex: 0, offset: 6 },
      });
      expect(document.getSelection()?.toString()).toBe('mirror');

      play(DomEventTypeEnum.Selection, { collapsed: true });
      expect(document.getSelection()?.rangeCount).toBe(0);
    });

    it('warns instead of throwing when the selected nodes are gone', async () => {
      const logger = (await import('@/shared/util')).logger;
      addBox('root');

      play(DomEventTypeEnum.Selection, {
        anchor: { selector: '#gone', childIndex: 0, offset: 0 },
        focus: { selector: '#gone', childIndex: 0, offset: 3 },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        '[replay selection] could not resolve the selected nodes:',
        '#gone',
      );
    });
  });
});
