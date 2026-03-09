import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRecord,
  DomEventPayload,
  SessionRoleEnum,
} from '@/shared/types';
import { type ReplaySpeed, REPLAY_SPEEDS } from '@/shared/consts';
import { normaliseUrl, sendRoleToTab, waitForTabLoad } from '@/shared/util';

const INITIAL_DELAY_MS = 500;

export class ReplayPageController {
  private readonly dom = {
    statusPill: document.getElementById('status-pill') as HTMLDivElement,
    statusLabel: document.getElementById('status-label') as HTMLSpanElement,

    setupCard: document.getElementById('setup-card') as HTMLElement,
    activeCard: document.getElementById('active-card') as HTMLElement,
    completedCard: document.getElementById('completed-card') as HTMLElement,

    urlInput: document.getElementById('replay-url') as HTMLInputElement,
    urlError: document.getElementById('url-error') as HTMLSpanElement,

    dropZone: document.getElementById('drop-zone') as HTMLDivElement,
    fileInput: document.getElementById('session-file') as HTMLInputElement,
    browseBtn: document.getElementById('browse-btn') as HTMLButtonElement,
    dropZoneIdle: document.getElementById('drop-zone-idle') as HTMLDivElement,
    dropZoneLoaded: document.getElementById(
      'drop-zone-loaded',
    ) as HTMLDivElement,
    fileName: document.getElementById('file-name') as HTMLSpanElement,
    fileEvents: document.getElementById('file-events') as HTMLSpanElement,
    clearFileBtn: document.getElementById(
      'clear-file-btn',
    ) as HTMLButtonElement,
    fileError: document.getElementById('file-error') as HTMLSpanElement,

    errorMsg: document.getElementById('error-msg') as HTMLParagraphElement,
    startBtn: document.getElementById('start-btn') as HTMLButtonElement,
    btnLabel: document.getElementById('btn-label') as HTMLSpanElement,
    btnSpinner: document.getElementById('btn-spinner') as HTMLSpanElement,

    activeUrl: document.getElementById('active-url') as HTMLSpanElement,
    speedBadge: document.getElementById('speed-badge') as HTMLSpanElement,
    progressLabel: document.getElementById('progress-label') as HTMLSpanElement,
    progressPercent: document.getElementById(
      'progress-percent',
    ) as HTMLSpanElement,
    progressBar: document.getElementById('progress-bar') as HTMLDivElement,

    pauseBtn: document.getElementById('pause-btn') as HTMLButtonElement,
    pauseIcon: document.getElementById('pause-icon') as HTMLSpanElement,
    pauseLabel: document.getElementById('pause-label') as HTMLSpanElement,
    restartBtn: document.getElementById('restart-btn') as HTMLButtonElement,
    stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,

    completedCount: document.getElementById(
      'completed-count',
    ) as HTMLSpanElement,
    restartCompletedBtn: document.getElementById(
      'restart-completed-btn',
    ) as HTMLButtonElement,
    stopCompletedBtn: document.getElementById(
      'stop-completed-btn',
    ) as HTMLButtonElement,
  };

  private records: SessionRecord[] = [];
  private targetTabId: number | null = null;
  private speed: ReplaySpeed = REPLAY_SPEEDS.Normal;
  private currentIndex = 0;
  private isPaused = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  init(): void {
    this.bindEvents();
  }

  private bindEvents(): void {
    this.dom.browseBtn.addEventListener('click', () => {
      this.dom.fileInput.click();
    });

    this.dom.fileInput.addEventListener('change', () => {
      const file = this.dom.fileInput.files?.[0];
      if (file) this.handleFile(file);
    });

    this.dom.dropZone.addEventListener('click', (e) => {
      if (
        e.target === this.dom.browseBtn ||
        e.target === this.dom.clearFileBtn
      ) {
        return;
      }
      if (this.records.length === 0) {
        this.dom.fileInput.click();
      }
    });

    this.dom.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dom.dropZone.classList.add('drag-over');
    });

    this.dom.dropZone.addEventListener('dragleave', () => {
      this.dom.dropZone.classList.remove('drag-over');
    });

    this.dom.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dom.dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files[0];
      if (file) this.handleFile(file);
    });

    this.dom.clearFileBtn.addEventListener('click', () => {
      this.clearFile();
    });

    this.dom.urlInput.addEventListener('input', () => {
      this.clearError();
      this.updateStartButton();
    });

    document
      .querySelectorAll<HTMLInputElement>('input[name="speed"]')
      .forEach((radio) => {
        radio.addEventListener('change', () => {
          this.speed = Number(radio.value) as ReplaySpeed;
        });
      });

    this.dom.startBtn.addEventListener('click', () => {
      this.start();
    });

    this.dom.pauseBtn.addEventListener('click', () => {
      if (this.isPaused) {
        this.continue();
      } else {
        this.pause();
      }
    });

    this.dom.restartBtn.addEventListener('click', () => {
      this.restart();
    });

    this.dom.stopBtn.addEventListener('click', () => {
      this.stop();
    });

    this.dom.restartCompletedBtn.addEventListener('click', () => {
      this.restart();
    });

    this.dom.stopCompletedBtn.addEventListener('click', () => {
      this.stop();
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.targetTabId !== null && this.targetTabId === tabId) {
        this.stop();
      }
    });
  }

  private handleFile(file: File): void {
    this.clearError();
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && ext !== 'txt') {
      this.showFileError('Please upload a .json or .txt file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result as string;
        this.records = this.parseFile(content, ext);
        if (this.records.length === 0) {
          this.showFileError('No events found in the session file');
          return;
        }
        this.showFileLoaded(file.name, this.records.length);
        this.updateStartButton();
      } catch {
        this.showFileError('Failed to parse session file');
        this.records = [];
      }
    };
    reader.readAsText(file);
  }

  private parseFile(content: string, ext: string): SessionRecord[] {
    if (ext === 'json') {
      const parsed: unknown = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid JSON format');
      }
      return parsed as SessionRecord[];
    }

    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    return lines.map((line) => {
      const timestampMatch = /^\[(.+?)\]/.exec(line);
      if (!timestampMatch) throw new Error('Invalid text format');

      const rest = line.slice(timestampMatch[0].length).trim();
      const parts = rest.split(' | ');

      const type = parts[0].trim();
      const selectorStackTrace = (parts[1] ?? '').replace(
        'selector stack trace: ',
        '',
      );
      const selector = (parts[2] ?? '').replace('selector: ', '');
      const contentStr = (parts[3] ?? '').replace('content: ', '');

      return {
        timestamp: timestampMatch[1],
        type,
        selectorStackTrace,
        selector,
        content: JSON.parse(contentStr) as SessionRecord['content'],
      } as SessionRecord;
    });
  }

  private showFileLoaded(name: string, count: number): void {
    this.dom.dropZoneIdle.hidden = true;
    this.dom.dropZoneLoaded.hidden = false;
    this.dom.fileName.textContent = name;
    this.dom.fileEvents.textContent = `${String(count)} events loaded`;
    this.dom.fileError.hidden = true;
  }

  private clearFile(): void {
    this.records = [];
    this.dom.fileInput.value = '';
    this.dom.dropZoneIdle.hidden = false;
    this.dom.dropZoneLoaded.hidden = true;
    this.dom.fileName.textContent = '';
    this.dom.fileEvents.textContent = '';
    this.dom.fileError.hidden = true;
    this.updateStartButton();
  }

  private showFileError(msg: string): void {
    this.dom.fileError.textContent = msg;
    this.dom.fileError.hidden = false;
  }

  private updateStartButton(): void {
    const urlValid = this.isUrlValid();
    const hasRecords = this.records.length > 0;
    this.dom.startBtn.disabled = !urlValid || !hasRecords;
  }

  private isUrlValid(): boolean {
    const value = this.dom.urlInput.value.trim();
    if (!value) return false;
    try {
      const url = new URL(normaliseUrl(value));
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private start(): void {
    if (!this.isUrlValid()) {
      this.dom.urlError.textContent = 'Please enter a valid URL';
      this.dom.urlError.hidden = false;
      return;
    }

    if (this.records.length === 0) {
      this.showFileError('Please upload a session file');
      return;
    }

    this.clearError();
    this.setLoading(true);

    const url = normaliseUrl(this.dom.urlInput.value.trim());

    chrome.runtime.sendMessage(
      {
        type: ExtensionMessageTypeEnum.StartReplay,
        payload: { url },
      } satisfies ExtensionMessage,
      (response: ExtensionMessage | undefined) => {
        this.setLoading(false);

        if (!response) {
          this.showError('Failed to communicate with extension');
          return;
        }

        if (response.type === ExtensionMessageTypeEnum.SessionError) {
          this.showError(response.error);
          return;
        }

        if (response.type === ExtensionMessageTypeEnum.ReplayReady) {
          this.targetTabId = response.payload.targetTabId;
          this.currentIndex = 0;
          this.isPaused = false;
          this.showActiveCard(url);
          this.scheduleNext();
        }
      },
    );
  }

  private scheduleNext(): void {
    if (this.isPaused || this.targetTabId === null) return;

    if (this.currentIndex >= this.records.length) {
      this.onCompleted();
      return;
    }

    const delay = this.calculateDelay(this.currentIndex);

    this.timerId = setTimeout(() => {
      this.playCurrentEvent();
    }, delay);
  }

  private playCurrentEvent(): void {
    if (this.isPaused || this.targetTabId === null) return;
    if (this.currentIndex >= this.records.length) {
      this.onCompleted();
      return;
    }

    const record = this.records[this.currentIndex];

    const payload: DomEventPayload = {
      type: record.type,
      selector: record.selectorStackTrace || record.selector,
      content: record.content,
      timestamp: record.timestamp,
    };

    chrome.tabs.sendMessage(this.targetTabId, {
      type: ExtensionMessageTypeEnum.ReplayEvent,
      payload,
    } satisfies ExtensionMessage);

    this.currentIndex++;
    this.updateProgress();
    this.scheduleNext();
  }

  private calculateDelay(index: number): number {
    if (index === 0) return INITIAL_DELAY_MS;

    const prevTimestamp = new Date(this.records[index - 1].timestamp).getTime();
    const currTimestamp = new Date(this.records[index].timestamp).getTime();
    const delta = currTimestamp - prevTimestamp;

    if (isNaN(delta) || delta <= 0) return 50;

    return Math.max(10, delta / this.speed);
  }

  private pause(): void {
    this.isPaused = true;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.dom.pauseIcon.textContent = '▶';
    this.dom.pauseLabel.textContent = 'Continue';
    this.dom.pauseBtn.classList.add('is-paused');
    this.setStatus('paused', 'Paused');
  }

  private continue(): void {
    this.isPaused = false;
    this.dom.pauseIcon.textContent = '⏸';
    this.dom.pauseLabel.textContent = 'Pause';
    this.dom.pauseBtn.classList.remove('is-paused');
    this.setStatus('playing', 'Playing');
    this.scheduleNext();
  }

  private restart(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentIndex = 0;
    this.isPaused = false;
    this.dom.pauseIcon.textContent = '⏸';
    this.dom.pauseLabel.textContent = 'Pause';
    this.dom.pauseBtn.classList.remove('is-paused');

    this.dom.setupCard.hidden = true;
    this.dom.activeCard.hidden = false;
    this.dom.completedCard.hidden = true;

    this.updateProgress();
    this.setStatus('playing', 'Reloading…');

    if (this.targetTabId === null) return;

    const tabId = this.targetTabId;
    const url = normaliseUrl(this.dom.urlInput.value.trim());

    chrome.tabs.update(tabId, { url }, () => {
      waitForTabLoad(tabId)
        .then(() => sendRoleToTab(tabId, SessionRoleEnum.Replay))
        .then(() => {
          this.setStatus('playing', 'Playing');
          this.scheduleNext();
        });
    });
  }

  private stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.targetTabId !== null) {
      chrome.runtime.sendMessage({
        type: ExtensionMessageTypeEnum.StopReplay,
        payload: { targetTabId: this.targetTabId },
      } satisfies ExtensionMessage);
      this.targetTabId = null;
    }

    this.currentIndex = 0;
    this.isPaused = false;

    this.dom.setupCard.hidden = false;
    this.dom.activeCard.hidden = true;
    this.dom.completedCard.hidden = true;

    this.setStatus('idle', 'Ready');
  }

  private onCompleted(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.dom.activeCard.hidden = true;
    this.dom.completedCard.hidden = false;
    this.dom.completedCount.textContent = String(this.records.length);
    this.setStatus('completed', 'Completed');
  }

  private showActiveCard(url: string): void {
    this.dom.setupCard.hidden = true;
    this.dom.activeCard.hidden = false;
    this.dom.completedCard.hidden = true;

    this.dom.activeUrl.textContent = url;
    this.dom.speedBadge.textContent = `${String(this.speed)}×`;
    this.updateProgress();
    this.setStatus('playing', 'Playing');
  }

  private updateProgress(): void {
    const total = this.records.length;
    const current = this.currentIndex;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    this.dom.progressLabel.textContent = `Event ${String(current)} / ${String(total)}`;
    this.dom.progressPercent.textContent = `${String(percent)}%`;
    this.dom.progressBar.style.width = `${String(percent)}%`;
  }

  private setStatus(
    className: 'idle' | 'playing' | 'paused' | 'completed' | 'error',
    label: string,
  ): void {
    this.dom.statusPill.className = `status-pill status-${className} d-flex items-center`;
    this.dom.statusLabel.textContent = label;
  }

  private setLoading(loading: boolean): void {
    this.dom.startBtn.disabled = loading;
    this.dom.btnLabel.textContent = loading ? 'Opening tab…' : 'Start Replay';
    this.dom.btnSpinner.hidden = !loading;
  }

  private showError(msg: string): void {
    this.dom.errorMsg.textContent = msg;
    this.dom.errorMsg.hidden = false;
  }

  private clearError(): void {
    this.dom.errorMsg.hidden = true;
    this.dom.urlError.hidden = true;
  }
}
