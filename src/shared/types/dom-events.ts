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

// ? whether the source element matched :focus-visible, so keyboard and mouse focus look alike on both tabs
export interface DomFocusEventPayload {
  visible?: boolean;
}

export type DomEventContent =
  | DomInputEventPayload
  | DomScrollEventPayload
  | DomKeyboardEventPayload
  | DomClickEventPayload
  | DomMousemoveEventPayload
  | DomFocusEventPayload
  | DomResizeEventPayload;

export const DomEventTypeEnum = {
  Click: 'click',
  Input: 'input',
  Scroll: 'scroll',
  Change: 'change',
  Keydown: 'keydown',
  Keyup: 'keyup',
  Mousemove: 'mousemove',
  Focus: 'focus',
  Blur: 'blur',
  Resize: 'resize',
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
