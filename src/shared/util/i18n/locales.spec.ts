import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Entry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

const root = path.resolve(__dirname, '../../../../_locales');
const read = (locale: string): Record<string, Entry> =>
  JSON.parse(readFileSync(path.join(root, locale, 'messages.json'), 'utf8'));

const PLURAL = /_(zero|one|two|few|many|other)$/;
const baseOf = (key: string) => key.replace(PLURAL, '');
const placeholdersIn = (text: string) =>
  [...text.matchAll(/\$([A-Za-z0-9_]+)\$/g)]
    .map((m) => m[1].toUpperCase())
    .sort();
const tagsIn = (text: string) =>
  [...text.matchAll(/<[^>]+>/g)].map((m) => m[0]).sort();

const en = read('en');
const locales = readdirSync(root).filter((name) => name !== 'en');
const enBaseKeys = new Set(Object.keys(en).map(baseOf));

describe('_locales', () => {
  it('ships the default locale with a description for every message', () => {
    for (const [key, entry] of Object.entries(en)) {
      expect(entry.description).toBeTruthy();
      expect(key).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    }
    expect(locales.length).toBeGreaterThan(0);
  });

  it('keeps message names unique when compared case-insensitively', () => {
    const lower = Object.keys(en).map((k) => k.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('respects the manifest limits for the name and description', () => {
    for (const locale of ['en', ...locales]) {
      const data = read(locale);
      expect(data.appName.message.length).toBeLessThanOrEqual(45);
      expect(data.appDescription.message.length).toBeLessThanOrEqual(132);
    }
  });

  it.each(locales)(
    '%s translates every message with matching placeholders and markup',
    (locale) => {
      const data = read(locale);
      const baseKeys = new Set(Object.keys(data).map(baseOf));

      expect([...baseKeys].sort()).toEqual([...enBaseKeys].sort());

      for (const [key, entry] of Object.entries(data)) {
        const reference = en[key] ?? en[`${baseOf(key)}_other`];
        expect(reference).toBeDefined();
        expect(entry.message.trim()).not.toBe('');
        expect(placeholdersIn(entry.message)).toEqual(
          placeholdersIn(reference.message),
        );
        expect(tagsIn(entry.message)).toEqual(tagsIn(reference.message));
        for (const name of placeholdersIn(entry.message)) {
          expect(
            Object.keys(entry.placeholders ?? {}).map((n) => n.toUpperCase()),
          ).toContain(name);
        }
        if (PLURAL.test(key))
          expect(data[`${baseOf(key)}_other`]).toBeDefined();
      }
    },
  );
});
