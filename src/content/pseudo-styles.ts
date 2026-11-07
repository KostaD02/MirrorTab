export interface PseudoStyleTarget {
  setHover(target: Element | null): void;
  setFocus(target: Element | null, visible: boolean): void;
  reset(): void;
}

export const HOVER_ATTR = 'data-mirrortab-hover';
export const FOCUS_ATTR = 'data-mirrortab-focus';
export const FOCUS_VISIBLE_ATTR = 'data-mirrortab-focus-visible';
export const FOCUS_WITHIN_ATTR = 'data-mirrortab-focus-within';
export const COPY_ATTR = 'data-mirrortab-copy';

const PSEUDO = /:focus-within|:focus-visible|:focus|:hover/g;

const REPLACEMENT: Record<string, string> = {
  ':hover': `[${HOVER_ATTR}]`,
  ':focus': `[${FOCUS_ATTR}]`,
  ':focus-visible': `[${FOCUS_VISIBLE_ATTR}]`,
  ':focus-within': `[${FOCUS_WITHIN_ATTR}]`,
};

export function rewriteSelector(selector: string): string | null {
  if (!/:focus|:hover/.test(selector)) return null;
  return selector.replace(PSEUDO, (match) => REPLACEMENT[match]);
}

// ? the target never gets real pointer input, so Chrome treats every script focus() there as keyboard
// focus; the page's own :focus-visible rules are therefore tied to the mirrored verdict, through :where()
// so their specificity, and with it every tie they win or lose, stays the same
export function restrictFocusVisible(selector: string): string {
  return selector.replace(
    /:focus-visible/g,
    `:focus-visible:where([${FOCUS_VISIBLE_ATTR}])`,
  );
}

// ? a sheet copied inline resolves url() against the page, so relative references are pinned first
export function absolutizeUrls(css: string, base: string): string {
  return css.replace(
    /url\(\s*(['"]?)(?!data:|https?:|\/\/|#)([^'")]+)\1\s*\)/g,
    (_match, quote: string, url: string) =>
      `url(${quote}${new URL(url, base).href}${quote})`,
  );
}

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return 'selectorText' in rule;
}

function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  return 'cssRules' in rule && 'insertRule' in rule;
}

export interface RuleEdit {
  group: CSSStyleSheet | CSSGroupingRule;
  original: CSSStyleRule;
  selector: string;
  copy: CSSRule | null;
}

// ? each copy goes right after its original, so it wins and loses exactly the ties the original would
export function copyRulesInPlace(
  group: CSSStyleSheet | CSSGroupingRule,
  edits: RuleEdit[] = [],
): RuleEdit[] {
  for (let i = 0; i < group.cssRules.length; i++) {
    const rule = group.cssRules[i];
    if (isStyleRule(rule)) {
      const selector = rewriteSelector(rule.selectorText);
      if (!selector) continue;
      const edit: RuleEdit = {
        group,
        original: rule,
        selector: rule.selectorText,
        copy: null,
      };
      try {
        group.insertRule(`${selector} { ${rule.style.cssText} }`, i + 1);
        edit.copy = group.cssRules[i + 1];
        i++;
      } catch {
        // a selector the engine rejects keeps its native behaviour only
      }
      if (rule.selectorText.includes(':focus-visible')) {
        try {
          rule.selectorText = restrictFocusVisible(rule.selectorText);
        } catch {
          // leave the original as it is
        }
      }
      if (edit.copy || rule.selectorText !== edit.selector) edits.push(edit);
    } else if (isGroupingRule(rule)) {
      copyRulesInPlace(rule, edits);
    }
  }
  return edits;
}

function chainOf(target: Element | null): Element[] {
  const chain: Element[] = [];
  for (let el: Element | null = target; el; ) {
    chain.push(el);
    const root = el.getRootNode();
    el = el.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return chain;
}

function swapChain(
  previous: Element[],
  next: Element[],
  attribute: string,
): Element[] {
  for (const el of previous) {
    if (!next.includes(el)) el.removeAttribute(attribute);
  }
  for (const el of next) {
    if (!el.hasAttribute(attribute)) el.setAttribute(attribute, '');
  }
  return next;
}

// ? synthetic events never switch :hover or :focus, and an unfocused window draws no focus at all,
// so the page's own rules for those pseudo-classes are copied onto attributes the replay sets
export class PseudoStyles implements PseudoStyleTarget {
  private processed = new WeakSet<CSSStyleSheet>();
  private readonly fetched = new Set<string>();
  private readonly edits: RuleEdit[] = [];
  private readonly inlined: {
    link: HTMLLinkElement;
    copy: HTMLStyleElement;
  }[] = [];
  private sheetCount = -1;
  private hoverChain: Element[] = [];
  private focusChain: Element[] = [];
  private focused: Element[] = [];
  private focusedVisible: Element[] = [];

  setHover(target: Element | null): void {
    this.sync();
    this.hoverChain = swapChain(this.hoverChain, chainOf(target), HOVER_ATTR);
  }

  setFocus(target: Element | null, visible: boolean): void {
    this.sync();
    this.focused = swapChain(this.focused, target ? [target] : [], FOCUS_ATTR);
    this.focusedVisible = swapChain(
      this.focusedVisible,
      target && visible ? [target] : [],
      FOCUS_VISIBLE_ATTR,
    );
    this.focusChain = swapChain(
      this.focusChain,
      chainOf(target),
      FOCUS_WITHIN_ATTR,
    );
  }

  // ? the page gets its own rules back once the tab is no longer a target
  reset(): void {
    this.setHover(null);
    this.setFocus(null, false);
    for (const edit of this.edits.reverse()) {
      try {
        edit.original.selectorText = edit.selector;
        if (edit.copy) {
          const index = Array.prototype.indexOf.call(
            edit.group.cssRules,
            edit.copy,
          );
          if (index !== -1) edit.group.deleteRule(index);
        }
      } catch {
        // a sheet the page replaced meanwhile has nothing left to restore
      }
    }
    this.edits.length = 0;
    for (const { link, copy } of this.inlined.splice(0)) {
      copy.remove();
      link.disabled = false;
    }
    this.fetched.clear();
    this.processed = new WeakSet<CSSStyleSheet>();
    this.sheetCount = -1;
  }

  private sync(): void {
    const sheets = Array.from(document.styleSheets);
    if (sheets.length === this.sheetCount) return;
    this.sheetCount = sheets.length;

    for (const sheet of sheets) {
      if (this.processed.has(sheet) || sheet.disabled) continue;
      this.processed.add(sheet);

      let readable = true;
      try {
        void sheet.cssRules;
      } catch {
        readable = false;
      }

      if (readable) {
        copyRulesInPlace(sheet, this.edits);
      } else if (
        sheet.href &&
        sheet.ownerNode instanceof HTMLLinkElement &&
        !this.fetched.has(sheet.href)
      ) {
        this.fetched.add(sheet.href);
        void this.inlineSheet(sheet.ownerNode, sheet.href);
      }
    }
  }

  // ? a cross-origin sheet hides its rules from script; an inline copy in the same spot can be edited
  private async inlineSheet(
    link: HTMLLinkElement,
    href: string,
  ): Promise<void> {
    try {
      const response = await fetch(href);
      if (!response.ok) return;
      const copy = document.createElement('style');
      copy.setAttribute(COPY_ATTR, href);
      if (link.media) copy.media = link.media;
      copy.textContent = absolutizeUrls(await response.text(), href);
      link.after(copy);
      link.disabled = true;
      this.inlined.push({ link, copy });
      this.sheetCount = -1;
      this.sync();
    } catch {
      // that sheet keeps native hover and focus only
    }
  }
}
