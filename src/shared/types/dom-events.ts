export interface DomInputEventPayload {
  value: string;
  // ? checkboxes and radios carry their state, contenteditable carries its markup
  checked?: boolean;
  html?: string;
}

export interface DomResizeEventPayload {
  width: string;
  height: string;
}

export interface DomMousemoveEventPayload {
  xRatio: number;
  yRatio: number;
}

export interface DomScrollEventPayload {
  scrollX: number;
  scrollY: number;
}

export interface DomKeyboardEventPayload {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface DomClickEventPayload {
  offsetXRatio: number;
  offsetYRatio: number;
}

export interface DomWheelEventPayload extends DomClickEventPayload {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface DomDragEventPayload extends DomClickEventPayload {
  // ? the dragged payload, which the browser only lets a page read on dragstart and drop
  types?: string[];
  data?: Record<string, string>;
  // ? names only: a dragged file's bytes stay on the source tab
  files?: string[];
  effectAllowed?: string;
  dropEffect?: string;
}

export interface DomPasteEventPayload {
  text: string;
  html?: string;
}

// ? one end of a selection: the element holding it, which of its child nodes, and the offset inside that node
export interface DomSelectionPoint {
  selector: string;
  // ? -1 when the point is the element itself rather than one of its children
  childIndex: number;
  offset: number;
}

export interface DomSelectionEventPayload {
  // ? an input or textarea selection is a flat range over its value
  start?: number;
  end?: number;
  direction?: string;
  // ? a page selection points into the DOM instead
  anchor?: DomSelectionPoint;
  focus?: DomSelectionPoint;
  // ? the selection was dropped, so the target clears its own
  collapsed?: boolean;
}

// ? whether the source element matched :focus-visible, so keyboard and mouse focus look alike on both tabs
export interface DomFocusEventPayload {
  visible?: boolean;
}

export type DomEventContent =
  | DomInputEventPayload
  | DomScrollEventPayload
  | DomKeyboardEventPayload
  | DomClickEventPayload
  | DomWheelEventPayload
  | DomDragEventPayload
  | DomPasteEventPayload
  | DomSelectionEventPayload
  | DomMousemoveEventPayload
  | DomFocusEventPayload
  | DomResizeEventPayload;

export const DomEventTypeEnum = {
  Click: 'click',
  Dblclick: 'dblclick',
  Contextmenu: 'contextmenu',
  Input: 'input',
  Scroll: 'scroll',
  Wheel: 'wheel',
  Change: 'change',
  Keydown: 'keydown',
  Keyup: 'keyup',
  Mousemove: 'mousemove',
  Focus: 'focus',
  Blur: 'blur',
  Resize: 'resize',
  Dragstart: 'dragstart',
  Dragover: 'dragover',
  Drop: 'drop',
  Dragend: 'dragend',
  Paste: 'paste',
  Selection: 'selectionchange',
} as const;

export type DomEventType =
  (typeof DomEventTypeEnum)[keyof typeof DomEventTypeEnum];

export interface DomEventPayload {
  type: DomEventType;
  selector: string;
  // ? iframe selector chain from the top document; empty for the page itself
  framePath: string;
  content: DomEventContent;
  timestamp: string;
}
