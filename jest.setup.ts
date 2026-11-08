import { chrome } from 'jest-chrome';
import en from './_locales/en/messages.json';

Object.assign(global, { chrome });

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const messages = en as Record<string, Entry | undefined>;

// ? tests see the English messages the way Chrome would render them
function getMessage(
  key: string,
  substitutions?: string | (string | number)[],
): string {
  if (key === '@@bidi_dir') return 'ltr';
  const entry = messages[key];
  if (!entry) return '';
  const subs = (
    substitutions === undefined
      ? []
      : Array.isArray(substitutions)
        ? substitutions
        : [substitutions]
  ).map(String);
  return entry.message
    .replace(/\$([A-Za-z0-9_]+)\$/g, (match, name: string) => {
      const placeholder = Object.entries(entry.placeholders ?? {}).find(
        ([n]) => n.toUpperCase() === name.toUpperCase(),
      )?.[1];
      if (!placeholder) return match;
      return placeholder.content.replace(
        /\$(\d)/g,
        (_m, i: string) => subs[Number(i) - 1] ?? '',
      );
    })
    .replace(/\$\$/g, '$');
}

function stubI18n(): void {
  chrome.i18n.getMessage.mockImplementation(getMessage);
  chrome.i18n.getUILanguage.mockReturnValue('en');
}

stubI18n();
beforeEach(stubI18n);
