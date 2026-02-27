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

/**
 * Compact human-readable identifier for logging/records.
 * Format: TAG#id#firstClass#attr=val  (NOT a valid CSS selector)
 */
export function getElementMeta(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()];

  if (el.id) parts.push(el.id);

  const firstClass = el.classList[0];
  if (firstClass) parts.push(firstClass);

  const idAttrs = ['name', 'data-id', 'aria-label', 'automation-id'];

  for (const attr of idAttrs) {
    const val = el.getAttribute(attr);
    if (val) {
      parts.push(`${attr}=${val}`);
      break;
    }
  }

  return parts.join('#');
}

/**
 * Returns a valid CSS selector.
 * Uses #id if present (unambiguous), otherwise falls back
 * to the full nth-of-type structural path.
 */
export function getSemanticSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  return getUniqueSelector(el);
}
