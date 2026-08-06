import { chrome } from 'jest-chrome';
import {
  buildPendingUrl,
  formatCountdown,
  parsePendingParams,
} from './pending';

describe('buildPendingUrl', () => {
  beforeEach(() => {
    (chrome.runtime.getURL as jest.Mock).mockImplementation(
      (p: string) => `chrome-extension://abc/${p}`,
    );
  });

  it('points at the pending page and carries the url and deadline', () => {
    const url = buildPendingUrl('https://a.test/page', 1750000000000);

    expect(url.startsWith('chrome-extension://abc/src/pending/index.html?')).toBe(
      true,
    );

    const parsed = parsePendingParams(url.slice(url.indexOf('?')));
    expect(parsed).toEqual({
      url: 'https://a.test/page',
      deadline: 1750000000000,
    });
  });

  it('escapes query strings in the target url so they survive the round trip', () => {
    const target = 'https://a.test/search?q=1&deadline=999';
    const url = buildPendingUrl(target, 42);

    expect(parsePendingParams(url.slice(url.indexOf('?')))).toEqual({
      url: target,
      deadline: 42,
    });
  });
});

describe('parsePendingParams', () => {
  it('returns null when the url is missing', () => {
    expect(parsePendingParams('?deadline=100')).toBeNull();
  });

  it('returns null when the deadline is missing or not a number', () => {
    expect(parsePendingParams('?url=https://a.test')).toBeNull();
    expect(parsePendingParams('?url=https://a.test&deadline=soon')).toBeNull();
  });

  it('returns null for an empty search string', () => {
    expect(parsePendingParams('')).toBeNull();
  });
});

describe('formatCountdown', () => {
  it('rounds up to whole seconds', () => {
    expect(formatCountdown(10000)).toBe('10');
    expect(formatCountdown(9001)).toBe('10');
    expect(formatCountdown(8999)).toBe('9');
    expect(formatCountdown(1)).toBe('1');
  });

  it('never reports a negative countdown', () => {
    expect(formatCountdown(0)).toBe('0');
    expect(formatCountdown(-5000)).toBe('0');
  });
});
