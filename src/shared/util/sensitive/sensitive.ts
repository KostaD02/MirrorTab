const SENSITIVE_AUTOCOMPLETE = ['current-password', 'new-password'];

export function isSensitiveField(el: Element | null | undefined): boolean {
  if (!el || el.tagName !== 'INPUT') return false;

  const input = el as HTMLInputElement;
  if (input.type === 'password') return true;

  return SENSITIVE_AUTOCOMPLETE.includes(input.autocomplete);
}
