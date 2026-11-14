/**
 * @jest-environment jsdom
 */

import { chrome } from 'jest-chrome';
import { localizePage, plural, t, textDirection, uiLanguage } from './i18n';

describe('i18n util', () => {
  describe('t', () => {
    it('returns the message for a key', () => {
      expect(t('startSession')).toBe('Start Session');
    });

    it('substitutes placeholders', () => {
      expect(t('errorStartSession', ['boom'])).toBe(
        'Failed to start session: boom',
      );
      expect(t('replayProgress', ['3', '12'])).toBe('Event 3 / 12');
    });

    it('returns the key itself when the message is missing', () => {
      expect(t('noSuchMessage')).toBe('noSuchMessage');
    });
  });

  describe('uiLanguage', () => {
    it('reads the browser UI language and falls back to English', () => {
      expect(uiLanguage()).toBe('en');
      chrome.i18n.getUILanguage.mockReturnValue('');
      expect(uiLanguage()).toBe('en');
    });
  });

  describe('plural', () => {
    it('picks the CLDR category of the count', () => {
      expect(plural('replayEventsLoaded', 1)).toBe('1 event loaded');
      expect(plural('replayEventsLoaded', 5)).toBe('5 events loaded');
      expect(plural('replayCompletedText', 1)).toBe(
        '1 event has been replayed successfully.',
      );
      expect(plural('replayCompletedText', 0)).toBe(
        'All 0 events have been replayed successfully.',
      );
    });

    it('falls back to the other form when a category has no message', () => {
      chrome.i18n.getUILanguage.mockReturnValue('ru');
      expect(plural('replayEventsLoaded', 3)).toBe('3 events loaded');
    });

    it('survives a locale the runtime does not know', () => {
      chrome.i18n.getUILanguage.mockReturnValue('not a locale');
      expect(plural('replayEventsLoaded', 2)).toBe('2 events loaded');
    });
  });

  describe('localizePage', () => {
    it('fills text, markup and attributes and sets the document language', () => {
      document.head.innerHTML = '<title data-i18n="replayTitle">x</title>';
      document.body.innerHTML = `
        <span data-i18n="pause">x</span>
        <p data-i18n-html="replayDropHint">x</p>
        <button data-i18n-attr="title:closeTitle; aria-label:infoCloseLabel">x</button>
        <input data-i18n-attr="placeholder:urlPlaceholder" />
      `;

      localizePage();

      expect(document.title).toBe('MirrorTab - Session Replay');
      expect(document.querySelector('span')?.textContent).toBe('Pause');
      expect(document.querySelector('p')?.innerHTML).toBe(
        'Drop a <strong>.json</strong> or <strong>.txt</strong> session file here',
      );
      expect(document.querySelector('button')?.title).toBe('Close');
      expect(document.querySelector('button')?.getAttribute('aria-label')).toBe(
        'Close info',
      );
      expect(document.querySelector('input')?.placeholder).toBe(
        'https://example.com',
      );
      expect(document.documentElement.lang).toBe('en');
    });

    it('sets the text direction from the predefined bidi message', () => {
      expect(textDirection()).toBe('ltr');
      localizePage();
      expect(document.documentElement.dir).toBe('ltr');

      chrome.i18n.getMessage.mockImplementation((key: string) =>
        key === '@@bidi_dir' ? 'rtl' : '',
      );
      expect(textDirection()).toBe('rtl');
      localizePage();
      expect(document.documentElement.dir).toBe('rtl');
    });

    it('falls back to the UI language when the bidi message says ltr', () => {
      chrome.i18n.getMessage.mockImplementation(() => 'ltr');
      chrome.i18n.getUILanguage.mockReturnValue('he');
      expect(textDirection()).toBe('rtl');

      chrome.i18n.getUILanguage.mockReturnValue('ar-EG');
      localizePage();
      expect(document.documentElement.dir).toBe('rtl');

      chrome.i18n.getUILanguage.mockReturnValue('en-US');
      expect(textDirection()).toBe('ltr');
    });

    it('leaves elements without a key alone', () => {
      document.body.innerHTML =
        '<span data-i18n="">keep</span><b data-i18n-attr="title">keep</b>';

      localizePage();

      expect(document.querySelector('span')?.textContent).toBe('');
      expect(document.querySelector('b')?.hasAttribute('title')).toBe(false);
    });
  });
});
