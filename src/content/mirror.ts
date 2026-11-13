import {
  DomClickEventPayload,
  DomDragEventPayload,
  DomEventPayload,
  DomEventTypeEnum,
  DomFocusEventPayload,
  DomInputEventPayload,
  DomKeyboardEventPayload,
  DomMousemoveEventPayload,
  DomPasteEventPayload,
  DomResizeEventPayload,
  DomScrollEventPayload,
  DomSelectionEventPayload,
  DomSelectionPoint,
  DomWheelEventPayload,
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
const SELECTION_DEBOUNCE_MS = 120;

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

function pointIn(
  element: Element,
  xRatio: number,
  yRatio: number,
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + xRatio * rect.width,
    y: rect.top + yRatio * rect.height,
  };
}

function offsetRatios(element: Element, e: MouseEvent): DomClickEventPayload {
  const rect = element.getBoundingClientRect();
  return {
    offsetXRatio: rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5,
    offsetYRatio: rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5,
  };
}

// ? only the string entries travel; a dragged file's bytes cannot cross the message boundary, so its name goes instead
function transferContent(
  transfer: DataTransfer | null,
): Partial<DomDragEventPayload> {
  if (!transfer) return {};

  const content: Partial<DomDragEventPayload> = {};
  const types = Array.from(transfer.types);
  if (types.length > 0) content.types = types;

  const data: Record<string, string> = {};
  for (const type of types) {
    if (type === 'Files') continue;
    try {
      const value = transfer.getData(type);
      if (value) data[type] = value;
    } catch {
      // ? the browser hides the payload everywhere but dragstart and drop
    }
  }
  if (Object.keys(data).length > 0) content.data = data;

  const files = Array.from(transfer.files).map((file) => file.name);
  if (files.length > 0) content.files = files;

  if (transfer.effectAllowed !== 'none') {
    content.effectAllowed = transfer.effectAllowed;
  }
  if (transfer.dropEffect !== 'none') {
    content.dropEffect = transfer.dropEffect;
  }

  return content;
}

// ? a field keeps a flat selection over its value, with no DOM nodes to point at
function fieldSelection(
  el: Element | null,
): { selector: string; content: DomSelectionEventPayload } | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return null;
  }

  let start: number | null = null;
  let end: number | null = null;
  try {
    start = el.selectionStart;
    end = el.selectionEnd;
  } catch {
    // ? types such as email and number keep no selection
    return null;
  }
  if (start === null || end === null) return null;

  const selector = getSemanticSelector(el);
  if (start === end) {
    return { selector, content: { start, end, collapsed: true } };
  }
  return {
    selector,
    content: { start, end, direction: el.selectionDirection ?? 'none' },
  };
}

function selectionPoint(node: Node, offset: number): DomSelectionPoint | null {
  if (node instanceof Element) {
    return { selector: getSemanticSelector(node), childIndex: -1, offset };
  }
  const parent = node.parentElement;
  if (!parent) return null;
  return {
    selector: getSemanticSelector(parent),
    childIndex: Array.from<Node>(parent.childNodes).indexOf(node),
    offset,
  };
}

function documentSelection(): {
  selector: string;
  content: DomSelectionEventPayload;
} | null {
  const selection = document.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return null;

  const anchor = selectionPoint(selection.anchorNode, selection.anchorOffset);
  const focus = selectionPoint(selection.focusNode, selection.focusOffset);
  if (!anchor || !focus) return null;

  if (selection.isCollapsed) {
    return { selector: anchor.selector, content: { collapsed: true } };
  }
  return { selector: anchor.selector, content: { anchor, focus } };
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
  private readonly pendingWheel = new Map<string, DomWheelEventPayload>();
  private pendingDragover: {
    selector: string;
    content: DomClickEventPayload;
  } | null = null;
  private rafPending = false;
  private wheelRafPending = false;
  private dragRafPending = false;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  // ? the element the last mirrored selection pointed at, so a dropped selection can still be cleared
  private selectedAt: string | null = null;
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
        this.emitPointer(DomEventTypeEnum.Click, e);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Dblclick,
      (e: MouseEvent) => {
        this.emitPointer(DomEventTypeEnum.Dblclick, e);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Contextmenu,
      (e: MouseEvent) => {
        this.emitPointer(DomEventTypeEnum.Contextmenu, e);
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

    document.addEventListener(
      DomEventTypeEnum.Wheel,
      (e: WheelEvent) => {
        this.queueWheel(e);
      },
      { capture: true, passive: true },
    );

    document.addEventListener(
      DomEventTypeEnum.Dragstart,
      (e: DragEvent) => {
        this.emitDrag(DomEventTypeEnum.Dragstart, e, true);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Dragover,
      (e: DragEvent) => {
        this.queueDragover(e);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Drop,
      (e: DragEvent) => {
        this.emitDrag(DomEventTypeEnum.Drop, e, true);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Dragend,
      (e: DragEvent) => {
        this.emitDrag(DomEventTypeEnum.Dragend, e, false);
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Paste,
      (e: ClipboardEvent) => {
        this.emitPaste(e);
      },
      true,
    );

    // ? a field raises select, the rest of the page selectionchange; both end up as one mirrored selection
    document.addEventListener(
      'select',
      (e: Event) => {
        this.queueSelection(targetOf(e));
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Selection,
      () => {
        this.queueSelection(null);
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

  private emitPointer(
    type:
      | typeof DomEventTypeEnum.Click
      | typeof DomEventTypeEnum.Dblclick
      | typeof DomEventTypeEnum.Contextmenu,
    e: MouseEvent,
  ): void {
    if (!this.active()) return;
    const element = targetOf(e);
    if (!element || element === document.documentElement) return;
    this.emit({
      type,
      selector: getSemanticSelector(element),
      content: offsetRatios(element, e),
    });
  }

  // ? a wheel turn arrives many times a frame, so the deltas are summed per element and sent once
  private queueWheel(e: WheelEvent): void {
    if (!this.active()) return;
    if (!this.settings.mirrorScroll) return;
    const element = targetOf(e);
    if (!element) return;

    const selector = getSemanticSelector(element);
    const pending = this.pendingWheel.get(selector);
    if (pending) {
      pending.deltaX += e.deltaX;
      pending.deltaY += e.deltaY;
      pending.deltaZ += e.deltaZ;
      Object.assign(pending, offsetRatios(element, e));
    } else {
      this.pendingWheel.set(selector, {
        ...offsetRatios(element, e),
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    }

    if (this.wheelRafPending) return;
    this.wheelRafPending = true;
    requestAnimationFrame(() => {
      this.wheelRafPending = false;
      const batch = [...this.pendingWheel];
      this.pendingWheel.clear();
      if (!this.active()) return;
      for (const [wheelSelector, content] of batch) {
        this.emit({
          type: DomEventTypeEnum.Wheel,
          selector: wheelSelector,
          content,
        });
      }
    });
  }

  // ? dragover fires as fast as the pointer moves; only the latest position is worth sending
  private queueDragover(e: DragEvent): void {
    if (!this.active()) return;
    const element = targetOf(e);
    if (!element) return;

    this.pendingDragover = {
      selector: getSemanticSelector(element),
      content: offsetRatios(element, e),
    };

    if (this.dragRafPending) return;
    this.dragRafPending = true;
    requestAnimationFrame(() => {
      this.dragRafPending = false;
      this.flushDragover();
    });
  }

  private flushDragover(): void {
    const pending = this.pendingDragover;
    this.pendingDragover = null;
    if (!pending || !this.active()) return;
    this.emit({ type: DomEventTypeEnum.Dragover, ...pending });
  }

  private emitDrag(
    type:
      | typeof DomEventTypeEnum.Dragstart
      | typeof DomEventTypeEnum.Drop
      | typeof DomEventTypeEnum.Dragend,
    e: DragEvent,
    withPayload: boolean,
  ): void {
    if (!this.active()) return;
    const element = targetOf(e);
    if (!element) return;

    // ? a drop and the end of a drag follow the last dragover, which is still waiting on a frame
    if (type !== DomEventTypeEnum.Dragstart) this.flushDragover();

    const content: DomDragEventPayload = offsetRatios(element, e);
    if (withPayload) Object.assign(content, transferContent(e.dataTransfer));

    this.emit({
      type,
      selector: getSemanticSelector(element),
      content,
    });
  }

  private emitPaste(e: ClipboardEvent): void {
    if (!this.active()) return;
    if (!this.settings.mirrorClipboard) return;
    const target = targetOf(e);
    if (!target) return;
    if (this.blocked(target)) return;

    const clipboard = e.clipboardData;
    const content: DomPasteEventPayload = {
      text: clipboard?.getData('text/plain') ?? '',
    };
    const html = clipboard?.getData('text/html');
    if (html) content.html = html;

    this.emit({
      type: DomEventTypeEnum.Paste,
      selector: getSemanticSelector(target),
      content,
    });
  }

  // ? dragging a selection changes it on every pointer move, so only the settled one is sent
  private queueSelection(target: Element | null): void {
    if (!this.active()) return;
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => {
      this.selectionTimer = null;
      this.emitSelection(target);
    }, SELECTION_DEBOUNCE_MS);
  }

  private emitSelection(target: Element | null): void {
    if (!this.active()) return;

    const next =
      fieldSelection(target) ??
      fieldSelection(document.activeElement) ??
      documentSelection();

    if (!next) {
      // ? the selection is gone with its nodes, so the target is told where to clear its own
      const selector = this.selectedAt;
      if (selector === null) return;
      this.selectedAt = null;
      this.emit({
        type: DomEventTypeEnum.Selection,
        selector,
        content: { collapsed: true },
      });
      return;
    }

    const collapsed = next.content.collapsed === true;
    // ? nothing was selected and nothing is now, so the target has nothing to clear
    if (collapsed && this.selectedAt === null) return;
    this.selectedAt = collapsed ? null : next.selector;

    this.emit({
      type: DomEventTypeEnum.Selection,
      selector: next.selector,
      content: next.content,
    });
  }
}

interface TransferInit {
  data?: Record<string, string>;
  effectAllowed?: string;
  dropEffect?: string;
}

// ? jsdom has no DataTransfer; this stands in so a replayed drag or paste still carries its payload
function stubTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const stub = {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [],
    items: [],
    get types(): string[] {
      return [...store.keys()];
    },
    clearData: (type?: string) => {
      if (type === undefined) {
        store.clear();
      } else {
        store.delete(type);
      }
    },
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    setDragImage: () => undefined,
  };
  return stub as unknown as DataTransfer;
}

// ? the source's transfer object cannot cross the message boundary, so the target builds its own
function makeTransfer(init: TransferInit): DataTransfer {
  const transfer =
    'DataTransfer' in window ? new DataTransfer() : stubTransfer();

  for (const [type, value] of Object.entries(init.data ?? {})) {
    try {
      transfer.setData(type, value);
    } catch {
      // ? a type this engine refuses to hold
    }
  }
  if (init.effectAllowed) {
    transfer.effectAllowed =
      init.effectAllowed as DataTransfer['effectAllowed'];
  }
  if (init.dropEffect) {
    transfer.dropEffect = init.dropEffect as DataTransfer['dropEffect'];
  }

  return transfer;
}

export class EventReplay {
  private settings: MirrorSettings = { ...DEFAULT_SETTINGS };
  private hovered: Element | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  private drag: DataTransfer | null = null;
  private dragTarget: Element | null = null;

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
          const { x, y } = pointIn(element, offsetXRatio, offsetYRatio);
          record({ offsetXRatio, offsetYRatio });
          this.frame.animateClick(x, y);
          this.pressAt(element, x, y);
          break;
        }

        case DomEventTypeEnum.Dblclick: {
          const { offsetXRatio, offsetYRatio } =
            payload.content as DomClickEventPayload;
          const { x, y } = pointIn(element, offsetXRatio, offsetYRatio);
          record({ offsetXRatio, offsetYRatio });
          this.frame.animateClick(x, y);
          this.setHovered(element, x, y);
          // ? the two clicks of the gesture were mirrored on their own; this is the event they add up to
          this.fire(element, 'dblclick', x, y, {
            button: 0,
            buttons: 0,
            detail: 2,
          });
          break;
        }

        // ? the page's own context menu opens; only a real pointer can open the browser's
        case DomEventTypeEnum.Contextmenu: {
          const { offsetXRatio, offsetYRatio } =
            payload.content as DomClickEventPayload;
          const { x, y } = pointIn(element, offsetXRatio, offsetYRatio);
          record({ offsetXRatio, offsetYRatio });
          this.setHovered(element, x, y);
          this.fire(element, 'pointerdown', x, y, { button: 2, buttons: 2 });
          this.fire(element, 'mousedown', x, y, { button: 2, buttons: 2 });
          this.fire(element, 'contextmenu', x, y, { button: 2, buttons: 0 });
          this.fire(element, 'pointerup', x, y, { button: 2, buttons: 0 });
          this.fire(element, 'mouseup', x, y, { button: 2, buttons: 0 });
          break;
        }

        // ? the scroll it caused is mirrored on its own; this is for pages that read the turn itself
        case DomEventTypeEnum.Wheel: {
          const content = payload.content as DomWheelEventPayload;
          const { x, y } = pointIn(
            element,
            content.offsetXRatio,
            content.offsetYRatio,
          );
          record(content);
          this.setHovered(element, x, y);
          element.dispatchEvent(
            new WheelEvent(DomEventTypeEnum.Wheel, {
              bubbles: true,
              cancelable: true,
              composed: true,
              view: window,
              clientX: x,
              clientY: y,
              deltaX: content.deltaX,
              deltaY: content.deltaY,
              deltaZ: content.deltaZ,
              deltaMode: content.deltaMode,
              ctrlKey: content.ctrlKey,
              shiftKey: content.shiftKey,
              altKey: content.altKey,
              metaKey: content.metaKey,
            }),
          );
          break;
        }

        case DomEventTypeEnum.Dragstart: {
          const content = payload.content as DomDragEventPayload;
          const { x, y } = pointIn(
            element,
            content.offsetXRatio,
            content.offsetYRatio,
          );
          record(content);
          this.drag = makeTransfer(content);
          this.dragTarget = null;
          this.fireDrag(element, DomEventTypeEnum.Dragstart, x, y);
          break;
        }

        case DomEventTypeEnum.Dragover: {
          const content = payload.content as DomDragEventPayload;
          const { x, y } = pointIn(
            element,
            content.offsetXRatio,
            content.offsetYRatio,
          );
          record(content);
          // ? no mouse event fires during a drag, so the ghost cursor follows the drag instead
          this.frame.moveTo(x, y);
          if (this.dragTarget !== element) {
            if (this.dragTarget) {
              this.fireDrag(this.dragTarget, 'dragleave', x, y, element);
            }
            this.dragTarget = element;
            this.fireDrag(element, 'dragenter', x, y);
          }
          this.fireDrag(element, DomEventTypeEnum.Dragover, x, y);
          break;
        }

        case DomEventTypeEnum.Drop: {
          const content = payload.content as DomDragEventPayload;
          const { x, y } = pointIn(
            element,
            content.offsetXRatio,
            content.offsetYRatio,
          );
          record(content);
          // ? a drag that began outside the page had no dragstart to carry the payload
          this.drag ??= makeTransfer(content);
          this.frame.moveTo(x, y);
          this.fireDrag(element, DomEventTypeEnum.Drop, x, y);
          this.dragTarget = null;
          break;
        }

        case DomEventTypeEnum.Dragend: {
          const content = payload.content as DomDragEventPayload;
          const { x, y } = pointIn(
            element,
            content.offsetXRatio,
            content.offsetYRatio,
          );
          record(content);
          this.fireDrag(element, DomEventTypeEnum.Dragend, x, y);
          this.drag = null;
          this.dragTarget = null;
          break;
        }

        // ? the pasted value arrives as its own input event; this is for pages that handle the paste themselves
        case DomEventTypeEnum.Paste: {
          const content = payload.content as DomPasteEventPayload;
          record(content);
          this.firePaste(element, content);
          break;
        }

        case DomEventTypeEnum.Selection: {
          const content = payload.content as DomSelectionEventPayload;
          record(content);
          this.applySelection(element, content);
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

  private fireDrag(
    element: Element,
    type: string,
    x: number,
    y: number,
    relatedTarget: Element | null = null,
  ): void {
    const init: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      relatedTarget,
    };
    const event =
      'DragEvent' in window
        ? new DragEvent(type, { ...init, dataTransfer: this.drag })
        : new MouseEvent(type, init);
    if (!('dataTransfer' in event)) {
      Object.defineProperty(event, 'dataTransfer', {
        value: this.drag,
        configurable: true,
      });
    }
    element.dispatchEvent(event);
  }

  private firePaste(element: Element, content: DomPasteEventPayload): void {
    const data: Record<string, string> = { 'text/plain': content.text };
    if (content.html !== undefined) data['text/html'] = content.html;
    const clipboardData = makeTransfer({ data });

    const init: EventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const event =
      'ClipboardEvent' in window
        ? new ClipboardEvent(DomEventTypeEnum.Paste, { ...init, clipboardData })
        : new Event(DomEventTypeEnum.Paste, init);
    if (!('clipboardData' in event)) {
      Object.defineProperty(event, 'clipboardData', {
        value: clipboardData,
        configurable: true,
      });
    }
    element.dispatchEvent(event);
  }

  private applySelection(
    element: HTMLElement,
    content: DomSelectionEventPayload,
  ): void {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const start = content.start ?? 0;
      const end = content.end ?? start;
      try {
        element.setSelectionRange(
          start,
          end,
          content.direction as 'forward' | 'backward' | 'none' | undefined,
        );
      } catch {
        // ? a field type that keeps no selection
      }
      return;
    }

    const selection = document.getSelection();
    if (!selection) return;

    if (content.collapsed === true || !content.anchor || !content.focus) {
      selection.removeAllRanges();
      return;
    }

    const anchor = this.resolvePoint(content.anchor);
    const focus = this.resolvePoint(content.focus);
    if (!anchor || !focus) {
      logger.warn(
        '[replay selection] could not resolve the selected nodes:',
        content.anchor.selector,
      );
      return;
    }

    try {
      selection.setBaseAndExtent(
        anchor,
        content.anchor.offset,
        focus,
        content.focus.offset,
      );
    } catch {
      // ? the target's text is shorter than the source's, so the offset falls outside it
      logger.warn('[replay selection] offset outside the target node');
    }
  }

  private resolvePoint(point: DomSelectionPoint): Node | null {
    const element = this.resolveElement(point.selector);
    if (!element) return null;
    if (point.childIndex < 0) return element;
    return element.childNodes[point.childIndex] ?? null;
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
