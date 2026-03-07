/**
 * @jest-environment jsdom
 */

import { resetFieldState, setFieldError, setFieldValid } from './field';

describe('field util', () => {
  let inputEl: HTMLInputElement;
  let errorEl: HTMLSpanElement;

  beforeEach(() => {
    inputEl = document.createElement('input');
    errorEl = document.createElement('span');
  });

  describe('setFieldError', () => {
    it('should add "invalid" class, remove "valid" class, set error message, and show error element', () => {
      inputEl.classList.add('valid');
      const errorMessage = 'Field is required';

      setFieldError(inputEl, errorEl, errorMessage);

      expect(inputEl.classList.contains('invalid')).toBe(true);
      expect(inputEl.classList.contains('valid')).toBe(false);
      expect(errorEl.textContent).toBe(errorMessage);
      expect(errorEl.hidden).toBe(false);
    });
  });

  describe('setFieldValid', () => {
    it('should remove "invalid" class, add "valid" class, clear error message, and hide error element', () => {
      inputEl.classList.add('invalid');
      errorEl.textContent = 'Some error';
      errorEl.hidden = false;

      setFieldValid(inputEl, errorEl);

      expect(inputEl.classList.contains('invalid')).toBe(false);
      expect(inputEl.classList.contains('valid')).toBe(true);
      expect(errorEl.textContent).toBe('');
      expect(errorEl.hidden).toBe(true);
    });
  });

  describe('resetFieldState', () => {
    it('should remove both "invalid" and "valid" classes, clear error message, and hide error element', () => {
      inputEl.classList.add('invalid', 'valid');
      errorEl.textContent = 'Some error';
      errorEl.hidden = false;

      resetFieldState(inputEl, errorEl);

      expect(inputEl.classList.contains('invalid')).toBe(false);
      expect(inputEl.classList.contains('valid')).toBe(false);
      expect(errorEl.textContent).toBe('');
      expect(errorEl.hidden).toBe(true);
    });
  });
});
