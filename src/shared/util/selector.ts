export function getUniqueSelector(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (current && current !== document.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === current?.tagName,
    );
    const index = siblings.indexOf(current) + 1;

    const selector = `${tag}:nth-of-type(${index.toString()})`;
    parts.unshift(selector);
    current = parent;
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
  if (el.id) {
    const selector = `#${CSS.escape(el.id)}`;
    if (document.querySelectorAll(selector).length === 1) {
      return selector;
    }
  }
  return getUniqueSelector(el);
}
