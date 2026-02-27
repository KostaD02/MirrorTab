import {
  ActiveSession,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  DownloadFormatEnum,
} from '@/shared/types';
import { resetFieldState } from '@/shared/util';
import { validateUrl } from './validate-url';

const StatusEnum = {
  Idle: 'idle',
  Active: 'active',
  Paused: 'paused',
  Error: 'error',
} as const;

type Status = (typeof StatusEnum)[keyof typeof StatusEnum];

export class PopupController {
  private readonly domRefs = {
    form: document.getElementById('session-form') as HTMLFormElement,
    sourceInput: document.getElementById('source-url') as HTMLInputElement,
    targetInput: document.getElementById('target-url') as HTMLInputElement,
    startBtn: document.getElementById('start-btn') as HTMLButtonElement,
    btnLabel: document.getElementById('btn-label') as HTMLSpanElement,
    btnSpinner: document.getElementById('btn-spinner') as HTMLSpanElement,
    errorMsg: document.getElementById('error-msg') as HTMLParagraphElement,
    sourceError: document.getElementById('source-error') as HTMLSpanElement,
    targetError: document.getElementById('target-error') as HTMLSpanElement,
    statusPill: document.getElementById('status-pill') as HTMLDivElement,
    statusLabel: document.getElementById('status-label') as HTMLSpanElement,
    activeCard: document.getElementById('active-card') as HTMLDivElement,
    activeSource: document.getElementById('active-source') as HTMLSpanElement,
    activeTarget: document.getElementById('active-target') as HTMLSpanElement,
    pauseBtn: document.getElementById('pause-btn') as HTMLButtonElement,
    pauseIcon: document.getElementById('pause-icon') as HTMLSpanElement,
    pauseLabel: document.getElementById('pause-label') as HTMLSpanElement,
    stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,
    downloadJson: document.getElementById('download-json') as HTMLAnchorElement,
    downloadText: document.getElementById('download-text') as HTMLAnchorElement,
  };

  private sourceDebounce: ReturnType<typeof setTimeout> | null = null;
  private targetDebounce: ReturnType<typeof setTimeout> | null = null;
  private session: ActiveSession | null = null;

  init(): void {
    this.restoreSession();
    this.bindEvents();
  }

  private async restoreSession(): Promise<void> {
    const extensionMessage: ExtensionMessage = {
      type: ExtensionMessageTypeEnum.GetSession,
    };
    const response = (await chrome.runtime.sendMessage(
      extensionMessage,
    )) as unknown as ExtensionMessage;

    if (
      response.type === ExtensionMessageTypeEnum.SessionStatus &&
      response.payload
    ) {
      this.applySessionState(response.payload);
    }
  }

  private applySessionState(s: ActiveSession): void {
    const {
      sourceInput,
      targetInput,
      activeSource,
      activeTarget,
      activeCard,
      pauseBtn,
      pauseIcon,
      pauseLabel,
    } = this.domRefs;
    this.session = s;
    sourceInput.value = s.sourceUrl;
    targetInput.value = s.targetUrl;
    this.setFormDisabled(true);

    activeSource.textContent = s.sourceUrl;
    activeTarget.textContent = s.targetUrl;
    activeCard.hidden = false;

    if (s.isPaused) {
      this.setStatus(StatusEnum.Paused);
      pauseBtn.classList.add('is-paused');
      pauseIcon.textContent = '▶';
      pauseLabel.textContent = 'Resume';
    } else {
      this.setStatus(StatusEnum.Active);
      pauseBtn.classList.remove('is-paused');
      pauseIcon.textContent = '⏸';
      pauseLabel.textContent = 'Pause';
    }
  }

  private setFormDisabled(disabled: boolean): void {
    const { sourceInput, targetInput, startBtn } = this.domRefs;
    sourceInput.disabled = disabled;
    targetInput.disabled = disabled;
    startBtn.disabled = disabled;
  }

  private setStatus(status: Status): void {
    const { statusPill, statusLabel } = this.domRefs;
    statusPill.className = `status-pill status-${status}`;
    statusLabel.textContent = status;
  }

  private clearError(): void {
    const { errorMsg } = this.domRefs;
    errorMsg.textContent = '';
    errorMsg.hidden = true;
  }

  private showError(msg: string): void {
    const { errorMsg } = this.domRefs;
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
    this.setStatus(StatusEnum.Error);
  }

  private resetToIdle(): void {
    const { sourceInput, targetInput, sourceError, targetError, activeCard } =
      this.domRefs;
    this.setFormDisabled(false);
    sourceInput.value = '';
    targetInput.value = '';
    resetFieldState(sourceInput, sourceError);
    resetFieldState(targetInput, targetError);
    activeCard.hidden = true;
    this.setStatus(StatusEnum.Idle);
    this.clearError();
  }

  private setLoading(loading: boolean): void {
    const { startBtn, btnLabel, btnSpinner, sourceInput, targetInput } =
      this.domRefs;
    startBtn.disabled = loading;
    btnLabel.hidden = loading;
    btnSpinner.hidden = !loading;
    sourceInput.readOnly = loading;
    targetInput.readOnly = loading;
  }

  private bindEvents(): void {
    const { form, pauseBtn, stopBtn, downloadJson, downloadText } =
      this.domRefs;
    form.addEventListener('submit', (e) => {
      this.onSubmit(e);
    });
    pauseBtn.addEventListener('click', () => {
      this.onPause();
    });
    stopBtn.addEventListener('click', () => {
      this.onStop();
    });
    downloadJson.addEventListener('click', (e) => {
      e.preventDefault();
      this.onDownload(DownloadFormatEnum.Json);
    });
    downloadText.addEventListener('click', (e) => {
      e.preventDefault();
      this.onDownload(DownloadFormatEnum.Text);
    });
    this.bindValidationListeners();
  }

  private async onSubmit(e: Event): Promise<void> {
    const { sourceInput, targetInput, sourceError, targetError } = this.domRefs;

    e.preventDefault();
    this.clearError();

    const sourceUrl = validateUrl(sourceInput.value, sourceInput, sourceError);
    const targetUrl = validateUrl(targetInput.value, targetInput, targetError);

    if (!sourceUrl || !targetUrl) return;

    this.setLoading(true);

    try {
      const extensionMessage: ExtensionMessage = {
        type: ExtensionMessageTypeEnum.StartSession,
        payload: {
          sourceUrl,
          targetUrl,
        },
      };
      const response = (await chrome.runtime.sendMessage(
        extensionMessage,
      )) as unknown as ExtensionMessage;
      this.setLoading(false);
      if (response.type === ExtensionMessageTypeEnum.SessionStarted) {
        this.applySessionState(response.payload);
      } else if (response.type === ExtensionMessageTypeEnum.SessionError) {
        this.showError(`Failed to start session: ${response.error}`);
      }
    } catch (err) {
      this.setLoading(false);
      this.showError(
        `Extension error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async onPause(): Promise<void> {
    const { pauseBtn } = this.domRefs;
    const isPaused = pauseBtn.classList.contains('is-paused');
    pauseBtn.disabled = true;
    const extensionMessage: ExtensionMessage = {
      type: isPaused
        ? ExtensionMessageTypeEnum.ResumeSession
        : ExtensionMessageTypeEnum.PauseSession,
    };
    try {
      const response = (await chrome.runtime.sendMessage(
        extensionMessage,
      )) as unknown as ExtensionMessage;
      if (
        response.type === ExtensionMessageTypeEnum.SessionStatus &&
        response.payload
      ) {
        this.applySessionState(response.payload);
      }
    } finally {
      pauseBtn.disabled = false;
    }
  }

  private async onStop(): Promise<void> {
    void this.sendToTargetTab({ type: ExtensionMessageTypeEnum.ClearRecord });
    await chrome.runtime.sendMessage({
      type: ExtensionMessageTypeEnum.StopSession,
    });
    this.session = null;
    this.resetToIdle();
  }

  private async onDownload(
    format: (typeof DownloadFormatEnum)[keyof typeof DownloadFormatEnum],
  ): Promise<void> {
    await this.sendToTargetTab({
      type: ExtensionMessageTypeEnum.DownloadRecord,
      payload: { format },
    });
  }

  private async sendToTargetTab(message: ExtensionMessage): Promise<void> {
    if (!this.session) return;
    await chrome.tabs
      .sendMessage(this.session.targetTabId, message)
      .catch(() => {
        // tab may have been closed
      });
  }

  private bindValidationListeners(): void {
    const { sourceInput, targetInput, sourceError, targetError } = this.domRefs;
    sourceInput.addEventListener('input', () => {
      if (sourceInput.disabled) return;
      if (this.sourceDebounce) clearTimeout(this.sourceDebounce);
      resetFieldState(sourceInput, sourceError);
      if (sourceInput.value.trim()) {
        this.sourceDebounce = setTimeout(() => {
          validateUrl(sourceInput.value, sourceInput, sourceError);
        }, 600);
      }
    });

    sourceInput.addEventListener('blur', () => {
      if (this.sourceDebounce) clearTimeout(this.sourceDebounce);
      if (!sourceInput.disabled && sourceInput.value.trim()) {
        validateUrl(sourceInput.value, sourceInput, sourceError);
      }
    });

    targetInput.addEventListener('input', () => {
      if (targetInput.disabled) return;
      if (this.targetDebounce) clearTimeout(this.targetDebounce);
      resetFieldState(targetInput, targetError);
      if (targetInput.value.trim()) {
        this.targetDebounce = setTimeout(() => {
          validateUrl(targetInput.value, targetInput, targetError);
        }, 600);
      }
    });

    targetInput.addEventListener('blur', () => {
      if (this.targetDebounce) clearTimeout(this.targetDebounce);
      if (!targetInput.disabled && targetInput.value.trim()) {
        validateUrl(targetInput.value, targetInput, targetError);
      }
    });
  }
}
