import { setFieldError, normaliseUrl, setFieldValid, t } from '@/shared/util';

export function validateUrl(
  raw: string,
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    setFieldError(inputEl, errorEl, t('errorUrlRequired'));
    return null;
  }

  const normalised = normaliseUrl(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(normalised);
  } catch {
    setFieldError(inputEl, errorEl, t('errorUrlInvalid'));
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    setFieldError(inputEl, errorEl, t('errorUrlScheme'));
    return null;
  }

  const host = parsed.hostname;
  if (host !== 'localhost' && !host.includes('.')) {
    setFieldError(inputEl, errorEl, t('errorUrlDomain'));
    return null;
  }

  if (host.endsWith('.') || host.startsWith('.')) {
    setFieldError(inputEl, errorEl, t('errorDomainInvalid'));
    return null;
  }

  setFieldValid(inputEl, errorEl);
  return normalised;
}
