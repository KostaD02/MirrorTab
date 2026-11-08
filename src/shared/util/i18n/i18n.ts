type Substitutions = string | string[];

// ? the key comes back when a message is missing, so an untranslated string is visible instead of blank
export function t(key: string, substitutions: Substitutions = []): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

export function uiLanguage(): string {
  return chrome.i18n.getUILanguage() || 'en';
}

// ? messages.json knows no plurals, so the CLDR category of the count picks a `<key>_<category>` message
export function plural(
  key: string,
  count: number,
  substitutions: Substitutions = [String(count)],
): string {
  let category = 'other';
  try {
    category = new Intl.PluralRules(uiLanguage()).select(count);
  } catch {
    // an unknown locale falls back to the `other` form
  }
  const specific = chrome.i18n.getMessage(`${key}_${category}`, substitutions);
  return specific || t(`${key}_other`, substitutions);
}

// ? static markup carries English; data-i18n swaps the text, data-i18n-html the markup,
// data-i18n-attr="title:key;aria-label:key" the attributes
export function localizePage(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n ?? '');
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml ?? '');
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (el.dataset.i18nAttr ?? '').split(';')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute && key) el.setAttribute(attribute, t(key));
    }
  }
  document.documentElement.lang = uiLanguage();
  document.documentElement.dir = textDirection();
}

const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'iw', 'ur']);

// ? @@bidi_dir is Chrome's verdict per the i18n guide; the language list covers browsers that only emulate the UI locale
export function textDirection(): 'ltr' | 'rtl' {
  if (chrome.i18n.getMessage('@@bidi_dir') === 'rtl') return 'rtl';
  const language = uiLanguage().split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}
