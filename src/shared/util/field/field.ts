export function setFieldError(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
  msg: string,
): void {
  inputEl.classList.add('kd-invalid');
  inputEl.classList.remove('kd-valid');
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

export function setFieldValid(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): void {
  inputEl.classList.remove('kd-invalid');
  inputEl.classList.add('kd-valid');
  errorEl.textContent = '';
  errorEl.hidden = true;
}

export function resetFieldState(
  inputEl: HTMLInputElement,
  errorEl: HTMLSpanElement,
): void {
  inputEl.classList.remove('kd-invalid', 'kd-valid');
  errorEl.textContent = '';
  errorEl.hidden = true;
}
