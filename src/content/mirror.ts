import {
  DomClickEventPayload,
  DomEventPayload,
  DomEventTypeEnum,
  DomFocusEventPayload,
  DomInputEventPayload,
  DomKeyboardEventPayload,
  DomMousemoveEventPayload,
  DomResizeEventPayload,
  DomScrollEventPayload,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  MirrorSettings,
  SessionRecord,
  SessionRole,
  SessionRoleEnum,
} from '@/shared/types';
import {
  getElementMeta,
  getSemanticSelector,
  isSensitiveField,
  logger,
  resolveSelector,
} from '@/shared/util';
import { DEFAULT_SETTINGS } from '@/shared/consts';
import { FrameContext } from './frame-bridge';
import { PseudoStyleTarget } from './pseudo-styles';

// are not re-captured and forwarded in an infinite loop.
let isReplaying = false;

const RESIZE_DEBOUNCE_MS = 100;

const POINTER_INIT: PointerEventInit = {
  pointerId: 1,
  pointerType: 'mouse',
  isPrimary: true,
};

const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]';

const NO_PSEUDO: PseudoStyleTarget = {
  setHover: () => undefined,
  setFocus: () => undefined,
  reset: () => undefined,
};

// ? the browser's own :focus-visible verdict; false where the engine does not know the selector
function matchesFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

// ? what Chrome treats as focus-visible on a mouse click: fields that take typing
function takesTyping(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return (
    el instanceof HTMLInputElement &&
    ![
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'range',
      'color',
      'file',
    ].includes(el.type)
  );
}

function sendDomEvent(payload: Omit<DomEventPayload, 'timestamp'>): void {
  const extensionMessage: ExtensionMessage = {
    type: ExtensionMessageTypeEnum.DomEvent,
    payload: {
      ...payload,
      timestamp: new Date().toISOString(),
    },
  };
  chrome.runtime.sendMessage(extensionMessage).catch(() => {
    // safe drop
  });
}

function sendRecord(record: SessionRecord): void {
  const extensionMessage: ExtensionMessage = {
    type: ExtensionMessageTypeEnum.RecordEvent,
    payload: record,
  };
  chrome.runtime.sendMessage(extensionMessage).catch(() => {
    // safe drop
  });
}

// ? e.target is retargeted to the shadow host; the composed path still holds the real element
function targetOf(e: Event): Element | null {
  const first = e.composedPath()[0];
  if (first instanceof Element) return first;
  return e.target instanceof Element ? e.target : null;
}

function isCheckable(el: Element | null): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    (el.type === 'checkbox' || el.type === 'radio')
  );
}

function inputContent(target: Element): DomInputEventPayload {
  if (isCheckable(target)) {
    return { value: target.value, checked: target.checked };
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return { value: target.value };
  }
  // ? contenteditable has no value, its markup is the state
  return { value: target.textContent ?? '', html: target.innerHTML };
}

function resizable(el: Node | null): el is HTMLElement {
  return el instanceof HTMLElement && getComputedStyle(el).resize !== 'none';
}

export class EventCapture {
  private readonly scrollTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly latestScrollPos = new Map<string, DomScrollEventPayload>();
  private readonly resizeTimers = new Map<
    HTMLElement,
    ReturnType<typeof setTimeout>
  >();
  private rafPending = false;
  private lastMouseXRatio = 0;
  private lastMouseYRatio = 0;
  private role: SessionRole = SessionRoleEnum.Idle;
  private settings: MirrorSettings = { ...DEFAULT_SETTINGS };
  private focusVisible = false;

  constructor(private readonly frame: FrameContext) {
    this.registerListeners();
    this.observeResizes();
  }

  setRole(role: SessionRole): void {
    this.role = role;
  }

  setSettings(settings: MirrorSettings): void {
    this.settings = settings;
  }

  private active(): boolean {
    return (
      this.role === SessionRoleEnum.Source &&
      !isReplaying &&
      this.frame.path !== null
    );
  }

  private blocked(target: Element | null): boolean {
    return !this.settings.mirrorPasswordFields && isSensitiveField(target);
  }

  private emit(
    payload: Omit<DomEventPayload, 'timestamp' | 'framePath'>,
  ): void {
    const framePath = this.frame.path;
    if (framePath === null) return;
    sendDomEvent({ ...payload, framePath });
  }

  private registerListeners(): void {
    document.addEventListener(
      DomEventTypeEnum.Click,
      (e: MouseEvent) => {
        if (!this.active()) return;
        const element = targetOf(e);
        if (!element || element === document.documentElement) return;
        const rect = element.getBoundingClientRect();
        const selector = getSemanticSelector(element);
        const content = {
          offsetXRatio:
            rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5,
          offsetYRatio:
            rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5,
        };
        this.emit({
          content,
          selector,
          type: DomEventTypeEnum.Click,
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Input,
      (e: Event) => {
        if (!this.active()) return;
        const target = targetOf(e);
        if (!target) return;
        if (this.blocked(target)) return;
        this.emit({
          type: DomEventTypeEnum.Input,
          selector: getSemanticSelector(target),
          content: inputContent(target),
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Change,
      (e: Event) => {
        if (!this.active()) return;
        const target = targetOf(e);
        if (!target) return;
        if (this.blocked(target)) return;
        this.emit({
          type: DomEventTypeEnum.Change,
          selector: getSemanticSelector(target),
          content: inputContent(target),
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Keydown,
      (e: KeyboardEvent) => {
        this.emitKey(DomEventTypeEnum.Keydown, e);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Keyup,
      (e: KeyboardEvent) => {
        this.emitKey(DomEventTypeEnum.Keyup, e);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Scroll,
      (e: Event) => {
        if (!this.active()) return;
        if (!this.settings.mirrorScroll) return;

        const target = e.target as Element | Document | null;
        const isWindow =
          !target ||
          target === document ||
          (target instanceof Element &&
            (target === document.documentElement || target === document.body));

        const selector = isWindow
          ? 'window'
          : getSemanticSelector(target as Element);

        const position: DomScrollEventPayload = isWindow
          ? { scrollX: window.scrollX, scrollY: window.scrollY }
          : {
              scrollX: (target as Element).scrollLeft,
              scrollY: (target as Element).scrollTop,
            };

        this.latestScrollPos.set(selector, position);

        const existing = this.scrollTimers.get(selector);
        if (existing) clearTimeout(existing);
        this.scrollTimers.set(
          selector,
          setTimeout(() => {
            this.scrollTimers.delete(selector);
            if (!this.active()) return;
            const pos = this.latestScrollPos.get(selector);
            if (!pos) return;
            this.emit({
              type: DomEventTypeEnum.Scroll,
              selector,
              content: pos,
            });
          }, this.settings.scrollDebounceMs),
        );
      },
      { capture: true, passive: true },
    );

    document.addEventListener(
      DomEventTypeEnum.Mousemove,
      (e: MouseEvent) => {
        if (!this.active()) return;
        if (!this.settings.mirrorMousemove) return;
        this.lastMouseXRatio = e.clientX / window.innerWidth;
        this.lastMouseYRatio = e.clientY / window.innerHeight;

        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
          this.rafPending = false;
          if (!this.active()) return;
          const content: DomMousemoveEventPayload = {
            xRatio: this.lastMouseXRatio,
            yRatio: this.lastMouseYRatio,
          };
          this.emit({
            type: DomEventTypeEnum.Mousemove,
            selector: 'window',
            content,
          });
        });
      },
      true,
    );

    document.addEventListener(
      'focusin',
      (e: FocusEvent) => {
        this.emitFocus(DomEventTypeEnum.Focus, targetOf(e));
      },
      true,
    );

    document.addEventListener(
      'focusout',
      (e: FocusEvent) => {
        this.emitFocus(DomEventTypeEnum.Blur, targetOf(e));
      },
      true,
    );
  }

  // ? dragging a resize handle raises no DOM event, but the browser writes the new size into the inline style
  private observeResizes(): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target;
        if (!this.active() || !resizable(element)) continue;
        const existing = this.resizeTimers.get(element);
        if (existing) clearTimeout(existing);
        this.resizeTimers.set(
          element,
          setTimeout(() => {
            this.resizeTimers.delete(element);
            if (!this.active()) return;
            const content: DomResizeEventPayload = {
              width: element.style.width,
              height: element.style.height,
            };
            this.emit({
              type: DomEventTypeEnum.Resize,
              selector: getSemanticSelector(element),
              content,
            });
          }, RESIZE_DEBOUNCE_MS),
        );
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    });
  }

  private emitKey(
    type: typeof DomEventTypeEnum.Keydown | typeof DomEventTypeEnum.Keyup,
    e: KeyboardEvent,
  ): void {
    if (!this.active()) return;
    if (!this.settings.mirrorKeystrokes) return;
    const target = targetOf(e);
    if (!target) return;
    if (this.blocked(target)) return;
    const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
    const content: DomKeyboardEventPayload = {
      key,
      code,
      ctrlKey,
      shiftKey,
      altKey,
      metaKey,
    };
    this.emit({
      type,
      selector: getSemanticSelector(target),
      content,
    });

    // ? a key press can turn a mouse-focused element focus-visible
    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      matchesFocusVisible(active) !== this.focusVisible
    ) {
      this.emitFocus(DomEventTypeEnum.Focus, active);
    }
  }

  private emitFocus(
    type: typeof DomEventTypeEnum.Focus | typeof DomEventTypeEnum.Blur,
    target: Element | null,
  ): void {
    if (!this.active()) return;
    if (!target) return;
    const content: DomFocusEventPayload = {};
    if (type === DomEventTypeEnum.Focus) {
      this.focusVisible = matchesFocusVisible(target);
      content.visible = this.focusVisible;
    }
    this.emit({
      type,
      selector: getSemanticSelector(target),
      content,
    });
  }
}

export class EventReplay {
  private settings: MirrorSettings = { ...DEFAULT_SETTINGS };
  private hovered: Element | null = null;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(
    private readonly frame: FrameContext,
    private readonly pseudo: PseudoStyleTarget = NO_PSEUDO,
  ) {
    // ? a mirrored scroll moves the page under a cursor that does not move, so hover is re-read once it settles
    document.addEventListener(
      'scrollend',
      () => {
        if (!this.lastPointer) return;
        const { x, y } = this.lastPointer;
        this.setHovered(document.elementFromPoint(x, y), x, y);
      },
      true,
    );
  }

  setSettings(settings: MirrorSettings): void {
    this.settings = settings;
  }

  replay(payload: DomEventPayload): void {
    // ? every frame of the tab receives the event; only the one it happened in replays it
    if (payload.framePath !== this.frame.path) return;

    isReplaying = true;

    try {
      const { type, selector, framePath } = payload;

      if (type === DomEventTypeEnum.Scroll) {
        const { scrollX, scrollY } = payload.content as DomScrollEventPayload;
        sendRecord({
          timestamp: payload.timestamp,
          framePath,
          type: DomEventTypeEnum.Scroll,
          selector,
          selectorStackTrace: selector,
          content: { scrollX, scrollY },
        });
        const behavior: ScrollBehavior = this.settings.smoothScroll
          ? 'smooth'
          : 'auto';
        if (selector === 'window') {
          window.scrollTo({ left: scrollX, top: scrollY, behavior });
        } else {
          const el = this.resolveElement(selector);
          if (el) {
            el.scrollTo({ left: scrollX, top: scrollY, behavior });
          } else {
            logger.warn(
              '[replay scroll] could not resolve element for selector:',
              selector,
            );
          }
        }
        return;
      }

      if (type === DomEventTypeEnum.Mousemove) {
        const { xRatio, yRatio } = payload.content as DomMousemoveEventPayload;
        const x = xRatio * window.innerWidth;
        const y = yRatio * window.innerHeight;
        this.frame.moveTo(x, y);
        this.pointerMoved(x, y);
        return;
      }

      const element = this.resolveElement(selector) as HTMLElement | null;

      if (!element) {
        logger.warn(`Could not resolve selector: ${selector}`);
        return;
      }

      const record = (content: SessionRecord['content']) => {
        sendRecord({
          timestamp: payload.timestamp,
          framePath,
          type,
          selector: getElementMeta(element),
          selectorStackTrace: selector,
          content,
        });
      };

      switch (type) {
        case DomEventTypeEnum.Click: {
          const { offsetXRatio, offsetYRatio } =
            payload.content as DomClickEventPayload;
          const rect = element.getBoundingClientRect();
          const clickX = rect.left + offsetXRatio * rect.width;
          const clickY = rect.top + offsetYRatio * rect.height;
          record({ offsetXRatio, offsetYRatio });
          this.frame.animateClick(clickX, clickY);
          this.pressAt(element, clickX, clickY);
          break;
        }

        case DomEventTypeEnum.Focus: {
          const { visible } = payload.content as DomFocusEventPayload;
          record({ visible: visible ?? false });
          this.focusElement(element, visible ?? takesTyping(element));
          break;
        }

        case DomEventTypeEnum.Blur: {
          record({});
          this.blurElement(element);
          break;
        }

        case DomEventTypeEnum.Input: {
          const content = payload.content as DomInputEventPayload;
          record(content);
          this.applyValue(element, content);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }

        case DomEventTypeEnum.Change: {
          const content = payload.content as DomInputEventPayload;
          record(content);
          this.applyValue(element, content);
          element.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }

        case DomEventTypeEnum.Resize: {
          const { width, height } = payload.content as DomResizeEventPayload;
          record({ width, height });
          element.style.width = width;
          element.style.height = height;
          break;
        }

        case DomEventTypeEnum.Keydown:
        case DomEventTypeEnum.Keyup: {
          const { key, code, ctrlKey, shiftKey, altKey, metaKey } =
            payload.content as DomKeyboardEventPayload;
          const content: DomKeyboardEventPayload = {
            key,
            code,
            ctrlKey,
            shiftKey,
            altKey,
            metaKey,
          };
          record(content);
          element.dispatchEvent(
            new KeyboardEvent(type, {
              bubbles: true,
              cancelable: true,
              ...content,
            }),
          );
          break;
        }
      }
    } finally {
      queueMicrotask(() => {
        isReplaying = false;
      });
    }
  }

  private resolveElement(selector: string): Element | null {
    try {
      return resolveSelector(selector);
    } catch {
      return null;
    }
  }

  private applyValue(
    element: HTMLElement,
    content: DomInputEventPayload,
  ): void {
    if (content.html !== undefined) {
      element.innerHTML = content.html;
      return;
    }

    if (isCheckable(element) && content.checked !== undefined) {
      element.checked = content.checked;
      return;
    }

    const value = content.value || '';
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value',
    )?.set;

    // ? the native setter keeps frameworks that patch `value` in sync
    if (setter) {
      setter.call(element, value);
    } else {
      (element as HTMLInputElement).value = value;
    }
  }

  // ? a real click is a whole gesture: the page may open menus on mousedown or focus on mouseup
  private pressAt(element: HTMLElement, x: number, y: number): void {
    this.setHovered(element, x, y);
    this.fire(element, 'pointerdown', x, y, { button: 0, buttons: 1 });
    this.fire(element, 'mousedown', x, y, { button: 0, buttons: 1 });
    // ? the source's own focus event normally arrived first; this only covers a click that raised none
    const focusable = element.closest(FOCUSABLE);
    if (
      focusable instanceof HTMLElement &&
      document.activeElement !== focusable
    ) {
      this.focusElement(focusable, takesTyping(focusable));
    }
    this.fire(element, 'pointerup', x, y, { button: 0, buttons: 0 });
    this.fire(element, 'mouseup', x, y, { button: 0, buttons: 0 });
    // ? the source mirrors the resulting change with its checked state; letting the click toggle too would undo it
    if (this.togglesCheckable(element)) {
      element.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
        },
        { once: true, capture: true },
      );
    }
    this.fire(element, 'click', x, y, { button: 0, buttons: 0, detail: 1 });
  }

  private togglesCheckable(element: Element): boolean {
    if (isCheckable(element)) return true;
    const label = element.closest('label');
    return label !== null && isCheckable(label.control);
  }

  // ? an unfocused window moves activeElement silently, so the events are raised by hand there
  private focusElement(element: HTMLElement, visible: boolean): void {
    const previous = document.activeElement;
    element.focus({ preventScroll: true });
    if (!document.hasFocus() && previous !== element) {
      if (previous instanceof HTMLElement && previous !== document.body) {
        this.fireFocus(previous, 'blur', element);
      }
      this.fireFocus(element, 'focus', previous);
    }
    this.pseudo.setFocus(element, visible);
  }

  private blurElement(element: HTMLElement): void {
    if (document.activeElement === element) {
      element.blur();
      if (!document.hasFocus()) {
        this.fireFocus(element, 'blur', null);
      }
    }
    this.pseudo.setFocus(null, false);
  }

  private fireFocus(
    element: Element,
    type: 'focus' | 'blur',
    relatedTarget: Element | null,
  ): void {
    element.dispatchEvent(
      new FocusEvent(type, { relatedTarget, composed: true }),
    );
    element.dispatchEvent(
      new FocusEvent(type === 'focus' ? 'focusin' : 'focusout', {
        relatedTarget,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private pointerMoved(x: number, y: number): void {
    this.lastPointer = { x, y };
    const target = document.elementFromPoint(x, y);
    this.setHovered(target, x, y);
    if (!target) return;
    this.fire(target, 'pointermove', x, y);
    this.fire(target, 'mousemove', x, y);
  }

  // ? synthetic events cannot switch CSS :hover, so the emulated styles follow the hovered chain too
  private setHovered(target: Element | null, x: number, y: number): void {
    const previous = this.hovered;
    if (previous === target) return;
    this.hovered = target;
    this.pseudo.setHover(target);

    if (previous) {
      this.fire(previous, 'pointerout', x, y, { relatedTarget: target });
      this.fire(previous, 'mouseout', x, y, { relatedTarget: target });
      for (let el: Element | null = previous; el; el = el.parentElement) {
        if (target && el.contains(target)) break;
        this.fire(el, 'pointerleave', x, y, { relatedTarget: target }, false);
        this.fire(el, 'mouseleave', x, y, { relatedTarget: target }, false);
      }
    }

    if (target) {
      this.fire(target, 'pointerover', x, y, { relatedTarget: previous });
      this.fire(target, 'mouseover', x, y, { relatedTarget: previous });
      const entered: Element[] = [];
      for (let el: Element | null = target; el; el = el.parentElement) {
        if (previous && el.contains(previous)) break;
        entered.push(el);
      }
      for (const el of entered.reverse()) {
        this.fire(el, 'pointerenter', x, y, { relatedTarget: previous }, false);
        this.fire(el, 'mouseenter', x, y, { relatedTarget: previous }, false);
      }
    }
  }

  private fire(
    element: Element,
    type: string,
    x: number,
    y: number,
    extra: MouseEventInit = {},
    bubbles = true,
  ): void {
    const init: MouseEventInit = {
      bubbles,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      ...extra,
    };
    const event =
      type.startsWith('pointer') && 'PointerEvent' in window
        ? new PointerEvent(type, { ...init, ...POINTER_INIT })
        : new MouseEvent(type, init);
    element.dispatchEvent(event);
  }
}
