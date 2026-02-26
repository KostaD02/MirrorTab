export function setFieldError(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
  msg: string,
): void {
  inputEl.classList.add('invalid');
  inputEl.classList.remove('valid');
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

export function setFieldValid(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): void {
  inputEl.classList.remove('invalid');
  inputEl.classList.add('valid');
  errorEl.textContent = '';
  errorEl.hidden = true;
}

export function resetFieldState(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): void {
  inputEl.classList.remove('invalid', 'valid');
  errorEl.textContent = '';
  errorEl.hidden = true;
}
