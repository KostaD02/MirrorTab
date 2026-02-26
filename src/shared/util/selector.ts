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
