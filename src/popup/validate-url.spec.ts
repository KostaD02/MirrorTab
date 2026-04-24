/**
 * @jest-environment jsdom
 */

import { validateUrl } from './validate-url';

describe('validateUrl', () => {
  let inputEl: HTMLInputElement;
  let errorEl: HTMLSpanElement;

  beforeEach(() => {
    inputEl = document.createElement('input');
    errorEl = document.createElement('span');
  });

  it('should return null and show error when input is empty', () => {
    const result = validateUrl('', inputEl, errorEl);

    expect(result).toBeNull();
    expect(inputEl.classList.contains('invalid')).toBe(true);
    expect(errorEl.textContent).toBe('URL is required.');
    expect(errorEl.hidden).toBe(false);
  });

  it('should return null and show error when input is only whitespace', () => {
    const result = validateUrl('   \t\n', inputEl, errorEl);

    expect(result).toBeNull();
    expect(errorEl.textContent).toBe('URL is required.');
  });

  it('should return null for an unparsable URL', () => {
    const result = validateUrl('http://', inputEl, errorEl);

    expect(result).toBeNull();
    expect(errorEl.textContent).toBe('Not a valid URL.');
    expect(inputEl.classList.contains('invalid')).toBe(true);
  });

  it('should reject host without a dot (unless localhost)', () => {
    const result = validateUrl('nodot', inputEl, errorEl);

    expect(result).toBeNull();
    expect(errorEl.textContent).toBe(
      'Enter a full domain (e.g. example.com).',
    );
  });

  it('should reject host starting or ending with dot', () => {
    const result = validateUrl('https://example.com.', inputEl, errorEl);

    expect(result).toBeNull();
    expect(errorEl.textContent).toBe('Not a valid domain.');
  });

  it('should accept localhost as a valid host', () => {
    const result = validateUrl('localhost:3000', inputEl, errorEl);

    expect(result).toBe('https://localhost:3000');
    expect(inputEl.classList.contains('valid')).toBe(true);
    expect(errorEl.hidden).toBe(true);
  });

  it('should prepend https:// for bare domains and mark field valid', () => {
    const result = validateUrl('example.com', inputEl, errorEl);

    expect(result).toBe('https://example.com');
    expect(inputEl.classList.contains('valid')).toBe(true);
    expect(errorEl.textContent).toBe('');
    expect(errorEl.hidden).toBe(true);
  });

  it('should preserve http:// if provided', () => {
    const result = validateUrl('http://example.com/path', inputEl, errorEl);

    expect(result).toBe('http://example.com/path');
    expect(inputEl.classList.contains('valid')).toBe(true);
  });

  it('should trim whitespace before validating', () => {
    const result = validateUrl('  example.com  ', inputEl, errorEl);

    expect(result).toBe('https://example.com');
  });
});
