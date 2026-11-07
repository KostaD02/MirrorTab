/**
 * @jest-environment jsdom
 */

import {
  COPY_ATTR,
  FOCUS_ATTR,
  FOCUS_VISIBLE_ATTR,
  FOCUS_WITHIN_ATTR,
  HOVER_ATTR,
  PseudoStyles,
  absolutizeUrls,
  copyRulesInPlace,
  restrictFocusVisible,
  rewriteSelector,
} from './pseudo-styles';

function addStyle(css: string): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

const selectors = (sheet: CSSStyleSheet) =>
  Array.from(sheet.cssRules).map((r) =>
    'selectorText' in r ? (r as CSSStyleRule).selectorText : r.cssText,
  );

describe('rewriteSelector', () => {
  it('maps the pseudo-classes to the emulation attributes', () => {
    expect(rewriteSelector('.btn:hover')).toBe(`.btn[${HOVER_ATTR}]`);
    expect(rewriteSelector('a:focus, a:focus-visible')).toBe(
      `a[${FOCUS_ATTR}], a[${FOCUS_VISIBLE_ATTR}]`,
    );
    expect(rewriteSelector('.card:focus-within .x')).toBe(
      `.card[${FOCUS_WITHIN_ATTR}] .x`,
    );
    expect(rewriteSelector('.tab:hover:not(:focus)')).toBe(
      `.tab[${HOVER_ATTR}]:not([${FOCUS_ATTR}])`,
    );
  });

  it('leaves selectors without those pseudo-classes alone', () => {
    expect(rewriteSelector('.btn')).toBeNull();
    expect(rewriteSelector('.btn:active, li:first-child')).toBeNull();
  });
});

describe('absolutizeUrls', () => {
  it('pins relative url() references to the sheet location', () => {
    const css =
      'a { background: url(img/a.png) } b { src: url(\'../f.woff2\') } c { x: url("data:image/png;base64,AA") } d { y: url(https://x.test/z.png) } e { z: url(#frag) }';

    expect(absolutizeUrls(css, 'https://cdn.test/css/site.css')).toBe(
      'a { background: url(https://cdn.test/css/img/a.png) } b { src: url(\'https://cdn.test/f.woff2\') } c { x: url("data:image/png;base64,AA") } d { y: url(https://x.test/z.png) } e { z: url(#frag) }',
    );
  });
});

describe('copyRulesInPlace', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('inserts each copy right after its original, inside groups too', () => {
    const style = addStyle(
      '.a { color: red; } .b:hover { color: blue; } .c { color: green; } @media (min-width: 600px) { .d:focus { outline: 0; } .e { margin: 0; } }',
    );

    const edits = copyRulesInPlace(style.sheet!);

    expect(edits).toHaveLength(2);
    expect(edits.every((e) => e.copy !== null)).toBe(true);
    expect(selectors(style.sheet!).slice(0, 4)).toEqual([
      '.a',
      '.b:hover',
      `.b[${HOVER_ATTR}]`,
      '.c',
    ]);
    const media = style.sheet!.cssRules[4] as CSSMediaRule;
    expect(selectors(media as unknown as CSSStyleSheet)).toEqual([
      '.d:focus',
      `.d[${FOCUS_ATTR}]`,
      '.e',
    ]);
  });
});

describe('restrictFocusVisible', () => {
  it('ties every :focus-visible to the mirrored verdict', () => {
    expect(restrictFocusVisible('a:focus-visible, .x:focus-visible .y')).toBe(
      `a:focus-visible:where([${FOCUS_VISIBLE_ATTR}]), .x:focus-visible:where([${FOCUS_VISIBLE_ATTR}]) .y`,
    );
  });

  it('narrows the original :focus-visible rule in place while copying it', () => {
    const style = addStyle(
      ':focus-visible { outline: 1px dashed red; } .btn:focus { color: red; }',
    );

    const edits = copyRulesInPlace(style.sheet!);

    expect(selectors(style.sheet!)).toEqual([
      `:focus-visible:where([${FOCUS_VISIBLE_ATTR}])`,
      `[${FOCUS_VISIBLE_ATTR}]`,
      '.btn:focus',
      `.btn[${FOCUS_ATTR}]`,
    ]);
    expect(edits[0].selector).toBe(':focus-visible');
    document.head.innerHTML = '';
  });
});

describe('PseudoStyles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks the hovered element and its ancestors, and clears them on change', () => {
    const outer = document.createElement('div');
    const inner = document.createElement('span');
    const other = document.createElement('p');
    outer.appendChild(inner);
    document.body.append(outer, other);
    const pseudo = new PseudoStyles();

    pseudo.setHover(inner);
    expect(inner.hasAttribute(HOVER_ATTR)).toBe(true);
    expect(outer.hasAttribute(HOVER_ATTR)).toBe(true);
    expect(document.body.hasAttribute(HOVER_ATTR)).toBe(true);

    pseudo.setHover(other);
    expect(inner.hasAttribute(HOVER_ATTR)).toBe(false);
    expect(outer.hasAttribute(HOVER_ATTR)).toBe(false);
    expect(other.hasAttribute(HOVER_ATTR)).toBe(true);

    pseudo.setHover(null);
    expect(document.querySelectorAll(`[${HOVER_ATTR}]`)).toHaveLength(0);
  });

  it('marks focus, focus-visible only when asked, and focus-within up the chain', () => {
    const form = document.createElement('form');
    const input = document.createElement('input');
    form.appendChild(input);
    document.body.appendChild(form);
    const pseudo = new PseudoStyles();

    pseudo.setFocus(input, false);
    expect(input.hasAttribute(FOCUS_ATTR)).toBe(true);
    expect(input.hasAttribute(FOCUS_VISIBLE_ATTR)).toBe(false);
    expect(form.hasAttribute(FOCUS_WITHIN_ATTR)).toBe(true);

    pseudo.setFocus(input, true);
    expect(input.hasAttribute(FOCUS_VISIBLE_ATTR)).toBe(true);

    pseudo.setFocus(null, false);
    expect(document.querySelectorAll(`[${FOCUS_ATTR}]`)).toHaveLength(0);
    expect(document.querySelectorAll(`[${FOCUS_VISIBLE_ATTR}]`)).toHaveLength(
      0,
    );
    expect(document.querySelectorAll(`[${FOCUS_WITHIN_ATTR}]`)).toHaveLength(0);
  });

  it('reaches through an open shadow root to the host', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const button = document.createElement('button');
    host.attachShadow({ mode: 'open' }).appendChild(button);
    const pseudo = new PseudoStyles();

    pseudo.setHover(button);

    expect(button.hasAttribute(HOVER_ATTR)).toBe(true);
    expect(host.hasAttribute(HOVER_ATTR)).toBe(true);
  });

  it('copies the rules of every sheet once, including sheets added later', () => {
    const first = addStyle('.btn:hover { color: red; }');
    const pseudo = new PseudoStyles();

    pseudo.setHover(document.body);
    pseudo.setHover(null);
    pseudo.setHover(document.body);
    expect(selectors(first.sheet!)).toEqual([
      '.btn:hover',
      `.btn[${HOVER_ATTR}]`,
    ]);

    const second = addStyle('.tab:focus { outline: 0; }');
    pseudo.setHover(null);
    expect(selectors(second.sheet!)).toEqual([
      '.tab:focus',
      `.tab[${FOCUS_ATTR}]`,
    ]);
  });

  it('replaces an unreadable linked sheet with an inline copy in the same place', async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.test/brand.css';
    const sibling = addStyle('.after { color: black; }');
    document.head.insertBefore(link, sibling);
    const fakeSheet = {
      disabled: false,
      href: 'https://cdn.test/brand.css',
      ownerNode: link,
      get cssRules(): CSSRuleList {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as CSSStyleSheet;
    const realSheets = Array.from(document.styleSheets);
    jest
      .spyOn(document, 'styleSheets', 'get')
      .mockImplementation(
        () => [fakeSheet, ...realSheets] as unknown as StyleSheetList,
      );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('.btn:hover { background: url(i.png); }'),
    });
    Object.assign(globalThis, { fetch: fetchMock });

    new PseudoStyles().setHover(document.body);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith('https://cdn.test/brand.css');
    const copy = document.querySelector<HTMLStyleElement>(`[${COPY_ATTR}]`);
    expect(copy?.previousElementSibling).toBe(link);
    expect(copy?.nextElementSibling).toBe(sibling);
    expect(copy?.textContent).toContain('url(https://cdn.test/i.png)');
    expect(link.disabled).toBe(true);
  });

  it('restores the page on reset: selectors, copies, attributes and links', () => {
    const style = addStyle(
      ':focus-visible { outline: 0; } .btn:hover { color: red; }',
    );
    const input = document.createElement('input');
    document.body.appendChild(input);
    const pseudo = new PseudoStyles();

    pseudo.setFocus(input, true);
    expect(style.sheet!.cssRules).toHaveLength(4);
    expect(input.hasAttribute(FOCUS_VISIBLE_ATTR)).toBe(true);

    pseudo.reset();

    expect(selectors(style.sheet!)).toEqual([':focus-visible', '.btn:hover']);
    expect(input.hasAttribute(FOCUS_ATTR)).toBe(false);
    expect(input.hasAttribute(FOCUS_VISIBLE_ATTR)).toBe(false);
    expect(document.body.hasAttribute(FOCUS_WITHIN_ATTR)).toBe(false);

    pseudo.setHover(input);
    expect(style.sheet!.cssRules).toHaveLength(4);
  });

  it('ignores a sheet it cannot read or fetch and never throws', () => {
    const style = addStyle('.btn:hover { color: red; }');
    Object.defineProperty(style.sheet, 'cssRules', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });

    expect(() => new PseudoStyles().setHover(document.body)).not.toThrow();
    expect(document.querySelector(`[${COPY_ATTR}]`)).toBeNull();
  });
});
