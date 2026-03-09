export interface DomInputEventPayload {
  value: string;
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

export type DomEventContent =
  | DomInputEventPayload
  | DomScrollEventPayload
  | DomKeyboardEventPayload
  | DomClickEventPayload
  | DomMousemoveEventPayload;

export const DomEventTypeEnum = {
  Click: 'click',
  Input: 'input',
  Scroll: 'scroll',
  Change: 'change',
  Keydown: 'keydown',
  Keyup: 'keyup',
  Mousemove: 'mousemove',
} as const;

export type DomEventType =
  (typeof DomEventTypeEnum)[keyof typeof DomEventTypeEnum];

export interface DomEventPayload {
  type: DomEventType;
  selector: string;
  content: DomEventContent;
  timestamp: string;
}
