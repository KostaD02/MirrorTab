// ? segments past a shadow root are joined with this; replay descends through each host's shadowRoot
export const SHADOW_SEPARATOR = ' >>> ';

export function getUniqueSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent || parent instanceof Document) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === current?.tagName,
    );
    const index = siblings.indexOf(current) + 1;

    const selector = `${tag}:nth-of-type(${index.toString()})`;
    parts.unshift(selector);
    current = parent instanceof Element ? parent : null;
  }

  return parts.length ? parts.join(' > ') : el.tagName.toLowerCase();
}

export function getElementMeta(el: Element): string {
  let result = el.tagName.toLowerCase();

  if (el.id) {
    result += `#${el.id}`;
  }

  const firstClass = el.classList[0];
  if (firstClass) {
    result += `.${firstClass}`;
  }

  const idAttrs = ['name', 'data-id', 'aria-label', 'automation-id'];
  for (const attr of idAttrs) {
    const val = el.getAttribute(attr);
    if (val) {
      result += `[${attr}=${val}]`;
      break;
    }
  }

  return result;
}

export function getSemanticSelector(el: Element): string {
  const root = el.getRootNode();
  const prefix =
    root instanceof ShadowRoot
      ? `${getSemanticSelector(root.host)}${SHADOW_SEPARATOR}`
      : '';

  if (el.id) {
    const scope: ParentNode = root instanceof ShadowRoot ? root : document;
    const selector = `#${CSS.escape(el.id)}`;
    if (scope.querySelectorAll(selector).length === 1) {
      return prefix + selector;
    }
  }
  return prefix + getUniqueSelector(el);
}

export function resolveSelector(
  selector: string,
  scope: ParentNode = document,
): Element | null {
  const [head, ...rest] = selector.split(SHADOW_SEPARATOR);
  const el = scope.querySelector(head);
  if (!el || rest.length === 0) return el;
  const shadow = el.shadowRoot;
  return shadow ? resolveSelector(rest.join(SHADOW_SEPARATOR), shadow) : null;
}
