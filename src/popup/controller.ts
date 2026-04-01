import {
  ActiveSession,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  DownloadFormatEnum,
} from '@/shared/types';
import { resetFieldState } from '@/shared/util';
import { validateUrl } from './validate-url';
import { INPUT_STORAGE_KEY } from '@/shared/consts';

const MAX_TARGETS = 10;

const StatusEnum = {
  Idle: 'idle',
  Active: 'active',
  Paused: 'paused',
  Error: 'error',
} as const;

type Status = (typeof StatusEnum)[keyof typeof StatusEnum];

interface TargetEntry {
  id: number;
  wrapper: HTMLDivElement;
  input: HTMLInputElement;
  error: HTMLSpanElement;
  removeBtn: HTMLButtonElement;
  debounce: ReturnType<typeof setTimeout> | null;
}

export class PopupController {
  private readonly domRefs = {
    form: document.getElementById('session-form') as HTMLFormElement,
    sourceInput: document.getElementById('source-url') as HTMLInputElement,
    startBtn: document.getElementById('start-btn') as HTMLButtonElement,
    btnLabel: document.getElementById('btn-label') as HTMLSpanElement,
    btnSpinner: document.getElementById('btn-spinner') as HTMLSpanElement,
    errorMsg: document.getElementById('error-msg') as HTMLParagraphElement,
    sourceError: document.getElementById('source-error') as HTMLSpanElement,
    statusPill: document.getElementById('status-pill') as HTMLDivElement,
    statusLabel: document.getElementById('status-label') as HTMLSpanElement,
    activeCard: document.getElementById('active-card') as HTMLDivElement,
    activeSource: document.getElementById('active-source') as HTMLSpanElement,
    activeTargetsList: document.getElementById(
      'active-targets-list',
    ) as HTMLDivElement,
    pauseBtn: document.getElementById('pause-btn') as HTMLButtonElement,
    pauseIcon: document.getElementById('pause-icon') as HTMLSpanElement,
    pauseLabel: document.getElementById('pause-label') as HTMLSpanElement,
    stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,
    downloadJson: document.getElementById('download-json') as HTMLAnchorElement,
    downloadText: document.getElementById('download-text') as HTMLAnchorElement,
    infoBtn: document.getElementById('info-btn') as HTMLButtonElement,
    infoCloseBtn: document.getElementById(
      'info-close-btn',
    ) as HTMLButtonElement,
    infoPanel: document.getElementById('info-panel') as HTMLDivElement,
    footer: document.getElementById('app-footer') as HTMLElement,
    versionLabel: document.getElementById('version') as HTMLSpanElement,
    replayLink: document.getElementById('replay-link') as HTMLAnchorElement,
    replayLinkContainer: document.getElementById(
      'replay-link-container',
    ) as HTMLDivElement,
    targetList: document.getElementById('target-list') as HTMLDivElement,
    addTargetBtn: document.getElementById(
      'add-target-btn',
    ) as HTMLButtonElement,
  };

  private sourceDebounce: ReturnType<typeof setTimeout> | null = null;
  private session: ActiveSession | null = null;
  private targetEntries: TargetEntry[] = [];
  private nextTargetId = 0;

  constructor(public readonly version: string) {}

  init(): void {
    this.restoreSession();
    this.restoreInputs();
    this.bindEvents();
    this.domRefs.versionLabel.textContent = `v${this.version}`;
  }

  private async restoreInputs(): Promise<void> {
    const data = await chrome.storage.local.get(INPUT_STORAGE_KEY);
    const inputs = data[INPUT_STORAGE_KEY] as
      | { source?: string; targets?: string[] }
      | undefined;

    if (inputs && !this.session) {
      if (inputs.source) this.domRefs.sourceInput.value = inputs.source;
      const targets = inputs.targets?.length ? inputs.targets : [''];
      for (const url of targets) {
        this.addTargetInput(url);
      }
    } else if (!this.session) {
      this.addTargetInput('');
    }
    this.updateAddTargetVisibility();
  }

  private saveInputsInStorage(): void {
    chrome.storage.local.set({
      [INPUT_STORAGE_KEY]: {
        source: this.domRefs.sourceInput.value,
        targets: this.targetEntries.map((e) => e.input.value),
      },
    });
  }

  private clearInputsFromStorage(): void {
    chrome.storage.local.remove(INPUT_STORAGE_KEY);
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
      activeSource,
      activeCard,
      activeTargetsList,
      pauseBtn,
      pauseIcon,
      pauseLabel,
    } = this.domRefs;
    this.session = s;
    sourceInput.value = s.sourceUrl;
    this.setFormDisabled(true);

    activeSource.textContent = s.sourceUrl;

    activeTargetsList.innerHTML = '';
    const multiTarget = s.targetTabIds.length > 1;
    for (let i = 0; i < s.targetTabIds.length; i++) {
      const row = document.createElement('div');
      row.className = 'active-target-row d-flex items-center';

      const dot = document.createElement('span');
      dot.className = 'active-target-dot';
      row.appendChild(dot);

      const url = document.createElement('span');
      url.className = 'active-url';
      url.textContent = s.targetUrls[i];
      url.title = s.targetUrls[i];
      row.appendChild(url);

      if (multiTarget) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-target';
        removeBtn.type = 'button';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this target';
        const tabId = s.targetTabIds[i];
        removeBtn.addEventListener('click', () => {
          this.onRemoveActiveTarget(tabId);
        });
        row.appendChild(removeBtn);
      }

      activeTargetsList.appendChild(row);
    }

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
    const { sourceInput, startBtn, addTargetBtn } = this.domRefs;
    sourceInput.disabled = disabled;
    startBtn.disabled = disabled;
    addTargetBtn.disabled = disabled;
    addTargetBtn.hidden = disabled;
    for (const entry of this.targetEntries) {
      entry.input.disabled = disabled;
      entry.removeBtn.hidden = disabled;
    }
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
    const { sourceInput, sourceError, activeCard } = this.domRefs;
    this.setFormDisabled(false);
    sourceInput.value = '';
    resetFieldState(sourceInput, sourceError);

    this.clearAllTargetInputs();
    this.addTargetInput('');
    this.updateAddTargetVisibility();

    activeCard.hidden = true;
    this.setStatus(StatusEnum.Idle);
    this.clearError();
    this.clearInputsFromStorage();
  }

  private setLoading(loading: boolean): void {
    const { startBtn, btnLabel, btnSpinner, sourceInput, addTargetBtn } =
      this.domRefs;
    startBtn.disabled = loading;
    btnLabel.hidden = loading;
    btnSpinner.hidden = !loading;
    sourceInput.readOnly = loading;
    addTargetBtn.disabled = loading;
    for (const entry of this.targetEntries) {
      entry.input.readOnly = loading;
    }
  }

  private addTargetInput(value: string): TargetEntry {
    const id = this.nextTargetId++;

    const wrapper = document.createElement('div');
    wrapper.className = 'field-group d-flex flex-col target-field-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'target-label-row d-flex items-center justify-between';

    const label = document.createElement('label');
    label.className = 'field-label d-flex items-center';
    label.htmlFor = `target-url-${id.toString()}`;
    label.innerHTML =
      '<span class="field-icon">🟢</span> Target URL';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-input';
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove target';

    labelRow.appendChild(label);
    labelRow.appendChild(removeBtn);
    wrapper.appendChild(labelRow);

    const input = document.createElement('input');
    input.id = `target-url-${id.toString()}`;
    input.className = 'field-input';
    input.type = 'url';
    input.placeholder = 'https://example.com';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = value;
    wrapper.appendChild(input);

    const hint = document.createElement('span');
    hint.className = 'field-hint';
    hint.textContent = 'Events will be replayed here';
    wrapper.appendChild(hint);

    const error = document.createElement('span');
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    wrapper.appendChild(error);

    this.domRefs.targetList.appendChild(wrapper);

    const entry: TargetEntry = {
      id,
      wrapper,
      input,
      error,
      removeBtn,
      debounce: null,
    };

    removeBtn.addEventListener('click', () => {
      this.removeTargetInput(entry);
    });

    this.bindTargetValidation(entry);
    this.targetEntries.push(entry);
    this.updateRemoveButtonVisibility();
    return entry;
  }

  private removeTargetInput(entry: TargetEntry): void {
    if (this.targetEntries.length <= 1) return;
    const idx = this.targetEntries.indexOf(entry);
    if (idx === -1) return;
    this.targetEntries.splice(idx, 1);
    entry.wrapper.remove();
    this.updateRemoveButtonVisibility();
    this.updateAddTargetVisibility();
    this.saveInputsInStorage();
  }

  private clearAllTargetInputs(): void {
    for (const entry of this.targetEntries) {
      entry.wrapper.remove();
    }
    this.targetEntries = [];
  }

  private updateRemoveButtonVisibility(): void {
    const hide = this.targetEntries.length <= 1;
    for (const entry of this.targetEntries) {
      entry.removeBtn.hidden = hide;
    }
  }

  private updateAddTargetVisibility(): void {
    this.domRefs.addTargetBtn.hidden =
      this.targetEntries.length >= MAX_TARGETS;
  }

  private bindEvents(): void {
    const {
      form,
      pauseBtn,
      stopBtn,
      downloadJson,
      downloadText,
      infoBtn,
      infoCloseBtn,
      addTargetBtn,
    } = this.domRefs;
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
    infoBtn.addEventListener('click', () => {
      this.openInfo();
    });
    infoCloseBtn.addEventListener('click', () => {
      this.closeInfo();
    });
    this.domRefs.replayLink.addEventListener('click', () => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/replay/index.html'),
      });
    });
    addTargetBtn.addEventListener('click', () => {
      this.addTargetInput('');
      this.updateAddTargetVisibility();
      this.saveInputsInStorage();
    });
    this.bindSourceValidation();
  }

  private openInfo(): void {
    const {
      form,
      activeCard,
      infoPanel,
      infoBtn,
      infoCloseBtn,
      statusPill,
      footer,
      replayLinkContainer,
    } = this.domRefs;
    form.hidden = true;
    activeCard.hidden = true;
    infoPanel.hidden = false;
    infoBtn.hidden = true;
    infoCloseBtn.hidden = false;
    statusPill.hidden = true;
    footer.hidden = true;
    replayLinkContainer.hidden = true;
  }

  private closeInfo(): void {
    const {
      form,
      infoPanel,
      infoBtn,
      infoCloseBtn,
      statusPill,
      footer,
      activeCard,
      replayLinkContainer,
    } = this.domRefs;
    infoPanel.hidden = true;
    infoBtn.hidden = false;
    infoCloseBtn.hidden = true;
    statusPill.hidden = false;
    footer.hidden = false;
    form.hidden = false;
    activeCard.hidden = !this.session;
    replayLinkContainer.hidden = false;
  }

  private async onSubmit(e: Event): Promise<void> {
    const { sourceInput, sourceError } = this.domRefs;

    e.preventDefault();
    this.clearError();

    const sourceUrl = validateUrl(sourceInput.value, sourceInput, sourceError);
    if (!sourceUrl) return;

    const targetUrls: string[] = [];
    let hasInvalid = false;
    for (const entry of this.targetEntries) {
      const url = validateUrl(entry.input.value, entry.input, entry.error);
      if (!url) {
        hasInvalid = true;
      } else {
        targetUrls.push(url);
      }
    }
    if (hasInvalid) return;

    this.setLoading(true);

    try {
      const extensionMessage: ExtensionMessage = {
        type: ExtensionMessageTypeEnum.StartSession,
        payload: {
          sourceUrl,
          targetUrls,
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
    this.sendToAllTargetTabs({ type: ExtensionMessageTypeEnum.ClearRecord });
    await chrome.runtime.sendMessage({
      type: ExtensionMessageTypeEnum.StopSession,
    });
    this.session = null;
    this.resetToIdle();
  }

  private async onRemoveActiveTarget(targetTabId: number): Promise<void> {
    const extensionMessage: ExtensionMessage = {
      type: ExtensionMessageTypeEnum.RemoveTarget,
      payload: { targetTabId },
    };
    const response = (await chrome.runtime.sendMessage(
      extensionMessage,
    )) as unknown as ExtensionMessage;

    if (response.type === ExtensionMessageTypeEnum.SessionStatus) {
      if (response.payload) {
        this.applySessionState(response.payload);
      } else {
        this.session = null;
        this.resetToIdle();
      }
    }
  }

  private async onDownload(
    format: (typeof DownloadFormatEnum)[keyof typeof DownloadFormatEnum],
  ): Promise<void> {
    await this.sendToAllTargetTabs({
      type: ExtensionMessageTypeEnum.DownloadRecord,
      payload: { format },
    });
  }

  private async sendToAllTargetTabs(message: ExtensionMessage): Promise<void> {
    if (!this.session) return;
    await Promise.all(
      this.session.targetTabIds.map((tabId) =>
        chrome.tabs.sendMessage(tabId, message).catch(() => {
          // tab may have been closed
        }),
      ),
    );
  }

  private bindSourceValidation(): void {
    const { sourceInput, sourceError } = this.domRefs;
    sourceInput.addEventListener('input', () => {
      if (sourceInput.disabled) return;
      this.saveInputsInStorage();
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
  }

  private bindTargetValidation(entry: TargetEntry): void {
    entry.input.addEventListener('input', () => {
      if (entry.input.disabled) return;
      this.saveInputsInStorage();
      if (entry.debounce) clearTimeout(entry.debounce);
      resetFieldState(entry.input, entry.error);
      if (entry.input.value.trim()) {
        entry.debounce = setTimeout(() => {
          validateUrl(entry.input.value, entry.input, entry.error);
        }, 600);
      }
    });

    entry.input.addEventListener('blur', () => {
      if (entry.debounce) clearTimeout(entry.debounce);
      if (!entry.input.disabled && entry.input.value.trim()) {
        validateUrl(entry.input.value, entry.input, entry.error);
      }
    });
  }
}
