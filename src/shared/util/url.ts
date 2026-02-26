import { setFieldError, setFieldValid } from './field';

export function normaliseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function validateUrl(
  raw: string,
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    setFieldError(inputEl, errorEl, 'URL is required.');
    return null;
  }

  const normalised = normaliseUrl(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(normalised);
  } catch {
    setFieldError(inputEl, errorEl, 'Not a valid URL.');
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    setFieldError(inputEl, errorEl, 'Only http:// and https:// are allowed.');
    return null;
  }

  const host = parsed.hostname;
  if (host !== 'localhost' && !host.includes('.')) {
    setFieldError(inputEl, errorEl, 'Enter a full domain (e.g. example.com).');
    return null;
  }

  if (host.endsWith('.') || host.startsWith('.')) {
    setFieldError(inputEl, errorEl, 'Not a valid domain.');
    return null;
  }

  setFieldValid(inputEl, errorEl);
  return normalised;
}
