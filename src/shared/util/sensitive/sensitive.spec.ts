/**
 * @jest-environment jsdom
 */

import { isSensitiveField } from './sensitive';

function input(attrs: Record<string, string>): HTMLInputElement {
  const el = document.createElement('input');
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

describe('isSensitiveField', () => {
  it('returns false for null and undefined', () => {
    expect(isSensitiveField(null)).toBe(false);
    expect(isSensitiveField(undefined)).toBe(false);
  });

  it('returns false for non-input elements', () => {
    expect(isSensitiveField(document.createElement('div'))).toBe(false);
    expect(isSensitiveField(document.createElement('textarea'))).toBe(false);
    expect(isSensitiveField(document.createElement('select'))).toBe(false);
  });

  it('detects a password input', () => {
    expect(isSensitiveField(input({ type: 'password' }))).toBe(true);
  });

  it('detects a text input revealed by a "show password" toggle', () => {
    expect(
      isSensitiveField(input({ type: 'text', autocomplete: 'current-password' })),
    ).toBe(true);
    expect(
      isSensitiveField(input({ type: 'text', autocomplete: 'new-password' })),
    ).toBe(true);
  });

  it('returns false for ordinary inputs', () => {
    expect(isSensitiveField(input({ type: 'text' }))).toBe(false);
    expect(isSensitiveField(input({ type: 'email' }))).toBe(false);
    expect(
      isSensitiveField(input({ type: 'text', autocomplete: 'username' })),
    ).toBe(false);
    expect(isSensitiveField(document.createElement('input'))).toBe(false);
  });
});
