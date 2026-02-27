import {
  DomClickEventPayload,
  DomEventPayload,
  DomEventTypeEnum,
  DomInputEventPayload,
  DomKeyboardEventPayload,
  DomScrollEventPayload,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRecord,
  SessionRole,
  SessionRoleEnum,
} from '@/shared/types';
import { getElementMeta, getSemanticSelector, logger } from '@/shared/util';

// are not re-captured and forwarded in an infinite loop.
let isReplaying = false;

function sendDomEvent(payload: DomEventPayload): void {
  const extensionMessage: ExtensionMessage = {
    type: ExtensionMessageTypeEnum.DomEvent,
    payload,
  };
  chrome.runtime.sendMessage(extensionMessage).catch(() => {
    // safe drop
  });
}

class Record {
  private readonly records: SessionRecord[] = [];

  get sessionRecords(): ReadonlyArray<SessionRecord> {
    return this.records;
  }

  addRecord(record: Omit<SessionRecord, 'timestamp'>): void {
    this.records.push({
      ...record,
      timestamp: new Date().toISOString(),
    });
  }

  clear(): void {
    this.records.splice(0);
  }
}

export class EventCapture {
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;
  private role: SessionRole = SessionRoleEnum.Idle;

  constructor() {
    this.registerListeners();
  }

  setRole(role: SessionRole): void {
    this.role = role;
  }

  private active(): boolean {
    return this.role === SessionRoleEnum.Source && !isReplaying;
  }

  private registerListeners(): void {
    document.addEventListener(
      DomEventTypeEnum.Click,
      (e: MouseEvent) => {
        if (!this.active()) return;
        const element = e.target as HTMLElement | null;
        if (!element || element === document.documentElement) return;
        const rect = element.getBoundingClientRect();
        const selector = getSemanticSelector(element);
        const content = {
          offsetXRatio:
            rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5,
          offsetYRatio:
            rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5,
        };
        sendDomEvent({
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
        const target = e.target as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!target) return;
        const selector = getSemanticSelector(target);
        sendDomEvent({
          type: DomEventTypeEnum.Input,
          selector,
          content: {
            value: target.value,
          },
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Change,
      (e: Event) => {
        if (!this.active()) return;
        const target = e.target as HTMLInputElement | HTMLSelectElement | null;
        if (!target) return;
        const selector = getSemanticSelector(target);
        const value = (target as HTMLInputElement).value;
        sendDomEvent({
          type: DomEventTypeEnum.Change,
          selector,
          content: {
            value,
          },
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Keydown,
      (e: KeyboardEvent) => {
        if (!this.active()) return;
        const target = e.target as Element | null;
        if (!target) return;
        const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
        const content: DomKeyboardEventPayload = {
          key,
          code,
          ctrlKey,
          shiftKey,
          altKey,
          metaKey,
        };
        const selector = getSemanticSelector(target);
        sendDomEvent({
          type: DomEventTypeEnum.Keydown,
          selector,
          content,
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Keyup,
      (e: KeyboardEvent) => {
        if (!this.active()) return;
        const target = e.target as Element | null;
        if (!target) return;
        const { key, code, ctrlKey, shiftKey, altKey, metaKey } = e;
        const content: DomKeyboardEventPayload = {
          key,
          code,
          ctrlKey,
          shiftKey,
          altKey,
          metaKey,
        };
        const selector = getSemanticSelector(target);
        sendDomEvent({
          type: DomEventTypeEnum.Keyup,
          selector,
          content,
        });
      },
      true,
    );

    document.addEventListener(
      DomEventTypeEnum.Scroll,
      () => {
        if (!this.active()) return;
        if (this.scrollTimer) return;
        this.scrollTimer = setTimeout(() => {
          this.scrollTimer = null;
          const content: DomScrollEventPayload = {
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          };
          const selector = 'window';
          sendDomEvent({
            type: DomEventTypeEnum.Scroll,
            selector,
            content,
          });
        }, 16);
      },
      true,
    );
  }
}

export class EventReplay extends Record {
  replay(payload: DomEventPayload): void {
    isReplaying = true;

    try {
      const { type, selector } = payload;

      if (type === DomEventTypeEnum.Scroll) {
        const { scrollX, scrollY } = payload.content as DomScrollEventPayload;
        const content: DomScrollEventPayload = {
          scrollX,
          scrollY,
        };
        this.addRecord({
          type: DomEventTypeEnum.Scroll,
          selector: 'window',
          selectorStackTrace: 'window',
          content,
        });
        window.scrollTo({
          left: scrollX,
          top: scrollY,
          behavior: 'instant',
        });
        return;
      }

      const element = this.resolveElement(selector) as HTMLElement | null;

      if (!element) {
        logger.warn(`Could not resolve selector: ${selector}`);
        return;
      }

      switch (type) {
        case DomEventTypeEnum.Click: {
          const { offsetXRatio, offsetYRatio } =
            payload.content as DomClickEventPayload;
          const rect = element.getBoundingClientRect();
          const content: DomClickEventPayload = {
            offsetXRatio,
            offsetYRatio,
          };
          this.addRecord({
            type: DomEventTypeEnum.Click,
            selector: getElementMeta(element),
            selectorStackTrace: selector,
            content,
          });

          element.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              clientX: rect.left + offsetXRatio * rect.width,
              clientY: rect.top + offsetYRatio * rect.height,
            }),
          );
          break;
        }

        case DomEventTypeEnum.Input: {
          const { value } = payload.content as DomInputEventPayload;
          const inputElement = element as
            | HTMLInputElement
            | HTMLTextAreaElement;
          const setter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(inputElement),
            'value',
          )?.set;

          if (setter) {
            setter.call(inputElement, value || '');
          } else {
            inputElement.value = value || '';
          }

          const content: DomInputEventPayload = {
            value,
          };
          this.addRecord({
            type: DomEventTypeEnum.Input,
            selector: getElementMeta(element),
            selectorStackTrace: selector,
            content,
          });

          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }

        case DomEventTypeEnum.Change: {
          const { value } = payload.content as DomInputEventPayload;
          const changeElement = element as HTMLInputElement | HTMLSelectElement;
          changeElement.value = value || '';

          const content: DomInputEventPayload = {
            value,
          };
          this.addRecord({
            type: DomEventTypeEnum.Change,
            selector: getElementMeta(element),
            selectorStackTrace: selector,
            content,
          });

          changeElement.dispatchEvent(new Event('change', { bubbles: true }));
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
          this.addRecord({
            type,
            selector: getElementMeta(element),
            selectorStackTrace: selector,
            content,
          });
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
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }
}
