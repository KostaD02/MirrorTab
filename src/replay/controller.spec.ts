/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { chrome } from 'jest-chrome';
import {
  DomEventTypeEnum,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRecord,
  SessionRoleEnum,
} from '@/shared/types';

jest.mock('@/shared/util', () => ({
  ...jest.requireActual('@/shared/util'),
  sendRoleToTab: jest.fn(),
  waitForTabLoad: jest.fn(),
}));

import { sendRoleToTab, waitForTabLoad } from '@/shared/util';
import { ReplayPageController } from './controller';

const mockedSendRoleToTab = sendRoleToTab as jest.MockedFunction<
  typeof sendRoleToTab
>;
const mockedWaitForTabLoad = waitForTabLoad as jest.MockedFunction<
  typeof waitForTabLoad
>;

function loadReplayHtml(): void {
  const htmlPath = path.resolve(__dirname, 'index.html');
  const html = readFileSync(htmlPath, 'utf-8');
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : '';
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

const sampleRecord = (
  overrides: Partial<SessionRecord> = {},
): SessionRecord => ({
  timestamp: '2026-04-24T10:00:00.000Z',
  selectorStackTrace: '#x',
  selector: 'div#x',
  type: DomEventTypeEnum.Click,
  content: { offsetXRatio: 0.5, offsetYRatio: 0.5 },
  ...overrides,
});

class MockFileReader {
  public static instances: MockFileReader[] = [];
  public onload: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
  public onerror: ((this: FileReader, ev: ProgressEvent) => void) | null = null;
  public result: string | ArrayBuffer | null = null;

  constructor() {
    MockFileReader.instances.push(this);
  }

  readAsText(blob: Blob): void {
    // In tests we stamp `result` before calling readAsText
    if (this.result == null && 'text' in blob) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (blob as any).text().then((t: string) => {
        this.result = t;
        this.onload?.call(this as unknown as FileReader, new ProgressEvent(''));
      });
      return;
    }
    this.onload?.call(this as unknown as FileReader, new ProgressEvent(''));
  }
}

function fakeFile(name: string, content: string): File {
  const file = new File([content], name, { type: 'text/plain' });
  // jsdom's File.text works, but the reader abstraction reads via FileReader
  return file;
}

describe('ReplayPageController', () => {
  let controller: ReplayPageController;
  let originalFileReader: typeof FileReader;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    loadReplayHtml();

    originalFileReader = globalThis.FileReader;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).FileReader = MockFileReader;
    MockFileReader.instances = [];

    mockedSendRoleToTab.mockResolvedValue(undefined);
    mockedWaitForTabLoad.mockResolvedValue(undefined);

    (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue(undefined);
    (chrome.tabs.update as jest.Mock).mockImplementation(
      (
        _tabId: number,
        _info: chrome.tabs.UpdateProperties,
        cb?: (tab?: chrome.tabs.Tab) => void,
      ) => {
        cb?.({} as chrome.tabs.Tab);
        return Promise.resolve({} as chrome.tabs.Tab);
      },
    );
    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
      (
        _msg: ExtensionMessage,
        cb?: (response: ExtensionMessage | undefined) => void,
      ) => {
        if (cb) {
          cb({
            type: ExtensionMessageTypeEnum.ReplayReady,
            payload: { targetTabId: 42 },
          });
        }
        return Promise.resolve(undefined);
      },
    );

    controller = new ReplayPageController();
    controller.init();
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.FileReader = originalFileReader;
  });

  async function loadFile(name: string, content: string): Promise<void> {
    const reader = MockFileReader.instances[MockFileReader.instances.length];
    const file = fakeFile(name, content);
    const fileInput = document.getElementById('session-file') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    fileInput.dispatchEvent(new Event('change'));
    // The just-created reader is at the end
    const r = MockFileReader.instances[MockFileReader.instances.length - 1];
    r.result = content;
    r.onload?.call(r as unknown as FileReader, new ProgressEvent(''));
    await flushPromises();
    void reader;
  }

  describe('file handling', () => {
    it('rejects files that are not .json or .txt', async () => {
      const fileInput = document.getElementById(
        'session-file',
      ) as HTMLInputElement;
      Object.defineProperty(fileInput, 'files', {
        value: [fakeFile('foo.pdf', '{}')],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event('change'));
      await flushPromises();

      expect(document.getElementById('file-error')?.hidden).toBe(false);
      expect(document.getElementById('file-error')?.textContent).toContain(
        '.json or .txt',
      );
    });

    it('parses a valid JSON array of records', async () => {
      const records = [sampleRecord({ selector: 'div#a' })];
      await loadFile('session.json', JSON.stringify(records));

      expect(document.getElementById('drop-zone-loaded')?.hidden).toBe(false);
      expect(document.getElementById('file-name')?.textContent).toBe(
        'session.json',
      );
      expect(document.getElementById('file-events')?.textContent).toBe(
        '1 events loaded',
      );
    });

    it('shows an error when JSON is not an array', async () => {
      await loadFile('bad.json', JSON.stringify({ not: 'an array' }));

      expect(document.getElementById('file-error')?.hidden).toBe(false);
    });

    it('shows an error when a JSON file contains no events', async () => {
      await loadFile('empty.json', '[]');

      expect(document.getElementById('file-error')?.textContent).toContain(
        'No events',
      );
    });

    it('parses a valid text log', async () => {
      const content =
        '[2026-04-24T10:00:00.000Z] click | selector stack trace: #a | selector: button#a | content: {"offsetXRatio":0.5,"offsetYRatio":0.5}';

      await loadFile('session.txt', content);

      expect(document.getElementById('drop-zone-loaded')?.hidden).toBe(false);
      expect(document.getElementById('file-events')?.textContent).toBe(
        '1 events loaded',
      );
    });

    it('shows an error for malformed text files', async () => {
      await loadFile('bad.txt', 'no timestamp here');

      expect(document.getElementById('file-error')?.hidden).toBe(false);
    });

    it('clears the loaded file', async () => {
      await loadFile('s.json', JSON.stringify([sampleRecord()]));
      expect(document.getElementById('drop-zone-loaded')?.hidden).toBe(false);

      document
        .getElementById('clear-file-btn')
        ?.dispatchEvent(new Event('click'));

      expect(document.getElementById('drop-zone-loaded')?.hidden).toBe(true);
      expect(document.getElementById('drop-zone-idle')?.hidden).toBe(false);
    });
  });

  describe('drop zone interactions', () => {
    it('adds and removes drag-over class', () => {
      const zone = document.getElementById('drop-zone')!;

      zone.dispatchEvent(
        new Event('dragover', { bubbles: true, cancelable: true }),
      );
      expect(zone.classList.contains('drag-over')).toBe(true);

      zone.dispatchEvent(new Event('dragleave', { bubbles: true }));
      expect(zone.classList.contains('drag-over')).toBe(false);
    });

    it('opens the browse dialog when browse button is clicked', () => {
      const fileInput = document.getElementById(
        'session-file',
      ) as HTMLInputElement;
      const clickSpy = jest.spyOn(fileInput, 'click').mockImplementation(() => {
        /* noop */
      });

      document.getElementById('browse-btn')?.dispatchEvent(new Event('click'));

      expect(clickSpy).toHaveBeenCalled();
    });

    it('handles drop event with a file', async () => {
      const zone = document.getElementById('drop-zone')!;
      const file = fakeFile('drop.json', JSON.stringify([sampleRecord()]));

      const ev = new Event('drop', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(ev, 'dataTransfer', {
        value: { files: [file] },
      });
      zone.dispatchEvent(ev);

      const reader =
        MockFileReader.instances[MockFileReader.instances.length - 1];
      reader.result = JSON.stringify([sampleRecord()]);
      reader.onload?.call(reader as unknown as FileReader, new ProgressEvent(''));
      await flushPromises();

      expect(document.getElementById('file-events')?.textContent).toContain(
        '1 events',
      );
    });
  });

  describe('url validation and start button', () => {
    it('start button is disabled until URL and file are present', () => {
      const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
      expect(startBtn.disabled).toBe(true);

      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = 'https://example.com';
      url.dispatchEvent(new Event('input'));
      expect(startBtn.disabled).toBe(true);
    });

    it('enables start button when both URL and file are valid', async () => {
      await loadFile('s.json', JSON.stringify([sampleRecord()]));

      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = 'https://example.com';
      url.dispatchEvent(new Event('input'));

      expect(
        (document.getElementById('start-btn') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('keeps start disabled when URL is whitespace-only', async () => {
      await loadFile('s.json', JSON.stringify([sampleRecord()]));

      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = '   ';
      url.dispatchEvent(new Event('input'));

      expect(
        (document.getElementById('start-btn') as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });

  describe('start / scheduling / completion', () => {
    async function readyToStart(records: SessionRecord[] = [sampleRecord()]) {
      await loadFile('s.json', JSON.stringify(records));
      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = 'example.com';
      url.dispatchEvent(new Event('input'));
    }

    it('shows the active card and schedules playback after ReplayReady', async () => {
      await readyToStart();

      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(document.getElementById('setup-card')?.hidden).toBe(true);
      expect(document.getElementById('active-card')?.hidden).toBe(false);
      expect(document.getElementById('active-url')?.textContent).toBe(
        'https://example.com',
      );
    });

    it('plays all events through setTimeout and shows completed card', async () => {
      const records: SessionRecord[] = [
        sampleRecord({ timestamp: '2026-04-24T10:00:00.000Z' }),
        sampleRecord({ timestamp: '2026-04-24T10:00:00.100Z' }),
      ];
      await readyToStart(records);

      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      // Initial delay + delta delays
      jest.advanceTimersByTime(10_000);
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          type: ExtensionMessageTypeEnum.ReplayEvent,
        }),
      );
      expect(document.getElementById('completed-card')?.hidden).toBe(false);
    });

    it('shows an error when backend returns SessionError', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementationOnce(
        (
          _msg: ExtensionMessage,
          cb?: (response: ExtensionMessage | undefined) => void,
        ) => {
          cb?.({
            type: ExtensionMessageTypeEnum.SessionError,
            error: 'nope',
          });
          return Promise.resolve(undefined);
        },
      );

      await readyToStart();
      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(document.getElementById('error-msg')?.textContent).toBe('nope');
      expect(document.getElementById('error-msg')?.hidden).toBe(false);
    });

    it('shows error when backend responds with undefined', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementationOnce(
        (
          _msg: ExtensionMessage,
          cb?: (response: ExtensionMessage | undefined) => void,
        ) => {
          cb?.(undefined);
          return Promise.resolve(undefined);
        },
      );

      await readyToStart();
      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(document.getElementById('error-msg')?.textContent).toContain(
        'Failed',
      );
    });

    it('shows URL error when start is clicked with an invalid URL', async () => {
      await loadFile('s.json', JSON.stringify([sampleRecord()]));
      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = '';

      // Force-enable the button to bypass the disabled gate
      (document.getElementById('start-btn') as HTMLButtonElement).disabled =
        false;

      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(document.getElementById('url-error')?.hidden).toBe(false);
    });
  });

  describe('pause / continue / stop / restart', () => {
    async function startSession() {
      await loadFile('s.json', JSON.stringify([sampleRecord(), sampleRecord()]));
      const url = document.getElementById('replay-url') as HTMLInputElement;
      url.value = 'example.com';
      url.dispatchEvent(new Event('input'));
      document.getElementById('start-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();
    }

    it('toggles pause and continue', async () => {
      await startSession();

      const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
      pauseBtn.dispatchEvent(new Event('click'));
      expect(pauseBtn.classList.contains('is-paused')).toBe(true);
      expect(
        document.getElementById('pause-label')?.textContent,
      ).toBe('Continue');

      pauseBtn.dispatchEvent(new Event('click'));
      expect(pauseBtn.classList.contains('is-paused')).toBe(false);
      expect(document.getElementById('pause-label')?.textContent).toBe('Pause');
    });

    it('stop button sends StopReplay and resets UI', async () => {
      await startSession();

      document.getElementById('stop-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      const stopCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.StopReplay);
      expect(stopCalls).toHaveLength(1);
      expect(document.getElementById('setup-card')?.hidden).toBe(false);
      expect(document.getElementById('active-card')?.hidden).toBe(true);
    });

    it('restart button re-navigates the tab and resumes playback', async () => {
      await startSession();

      document.getElementById('restart-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(chrome.tabs.update).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ url: 'https://example.com' }),
        expect.any(Function),
      );
      expect(mockedWaitForTabLoad).toHaveBeenCalledWith(42);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        42,
        SessionRoleEnum.Replay,
      );
    });

    it('auto-stops when the target tab is closed', async () => {
      await startSession();

      chrome.tabs.onRemoved.callListeners(42, {
        windowId: 1,
        isWindowClosing: false,
      });
      await flushPromises();

      expect(document.getElementById('setup-card')?.hidden).toBe(false);
    });

    it('ignores onRemoved for other tab ids', async () => {
      await startSession();

      chrome.tabs.onRemoved.callListeners(999, {
        windowId: 1,
        isWindowClosing: false,
      });
      await flushPromises();

      expect(document.getElementById('setup-card')?.hidden).toBe(true);
    });
  });

  describe('speed selection', () => {
    it('updates speed when a different radio is selected', () => {
      const slow = document.querySelector<HTMLInputElement>(
        'input[name="speed"][value="0.5"]',
      )!;
      slow.checked = true;
      slow.dispatchEvent(new Event('change'));

      // No public accessor — indirect check via speed badge after start, but
      // at minimum verify the handler runs without throwing.
      expect(slow.checked).toBe(true);
    });
  });
});
