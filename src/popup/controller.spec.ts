/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { chrome } from 'jest-chrome';
import {
  ActiveSession,
  DownloadFormatEnum,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
} from '@/shared/types';
import { INPUT_STORAGE_KEY } from '@/shared/consts';

jest.mock('./validate-url', () => ({
  validateUrl: jest.fn(),
}));

import { validateUrl } from './validate-url';
import { PopupController } from './controller';

const mockedValidateUrl = validateUrl as jest.MockedFunction<typeof validateUrl>;

function loadPopupHtml(): void {
  const htmlPath = path.resolve(__dirname, 'index.html');
  const html = readFileSync(htmlPath, 'utf-8');
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/.exec(html);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : '';
}

async function flushPromises(): Promise<void> {
  // Resolve chained `.then()` callbacks — works with fake timers since we
  // only rely on microtasks, not setTimeout.
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe('PopupController', () => {
  let controller: PopupController;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    loadPopupHtml();

    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
      type: ExtensionMessageTypeEnum.SessionStatus,
      payload: null,
    } satisfies ExtensionMessage);

    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.storage.local.remove as jest.Mock).mockResolvedValue(undefined);

    (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue(undefined);
    (chrome.tabs.create as jest.Mock).mockResolvedValue(undefined);
    (chrome.runtime.getURL as jest.Mock).mockImplementation(
      (p: string) => `chrome-extension://id/${p}`,
    );

    mockedValidateUrl.mockImplementation((raw) => raw.trim() || null);

    controller = new PopupController('1.2.3');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('init', () => {
    it('sets the version label and adds a default target input', async () => {
      controller.init();
      await flushPromises();

      expect(document.getElementById('version')?.textContent).toBe('v1.2.3');
      expect(
        document.querySelectorAll<HTMLInputElement>(
          '#target-list input[type="url"]',
        ),
      ).toHaveLength(1);
    });

    it('restores stored inputs when no active session exists', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        [INPUT_STORAGE_KEY]: {
          source: 'https://stored.test',
          targets: ['https://t1.test', 'https://t2.test'],
        },
      });

      controller.init();
      await flushPromises();

      expect(
        (document.getElementById('source-url') as HTMLInputElement).value,
      ).toBe('https://stored.test');
      const inputs = document.querySelectorAll<HTMLInputElement>(
        '#target-list input[type="url"]',
      );
      expect(inputs).toHaveLength(2);
      expect(inputs[0].value).toBe('https://t1.test');
      expect(inputs[1].value).toBe('https://t2.test');
    });

    it('applies an active session returned from GetSession', async () => {
      const session: ActiveSession = {
        sourceTabId: 1,
        targetTabIds: [2, 3],
        isPaused: false,
        sourceUrl: 'https://src.test',
        targetUrls: ['https://a.test', 'https://b.test'],
      };
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: session,
      } satisfies ExtensionMessage);

      controller.init();
      await flushPromises();

      expect(
        (document.getElementById('source-url') as HTMLInputElement).value,
      ).toBe('https://src.test');
      expect(
        (document.getElementById('source-url') as HTMLInputElement).disabled,
      ).toBe(true);
      expect(document.getElementById('active-card')?.hidden).toBe(false);
      expect(document.getElementById('active-source')?.textContent).toBe(
        'https://src.test',
      );
      expect(document.getElementById('status-label')?.textContent).toBe(
        'active',
      );
    });

    it('shows paused state for a paused session', async () => {
      const session: ActiveSession = {
        sourceTabId: 1,
        targetTabIds: [2],
        isPaused: true,
        sourceUrl: 'https://src.test',
        targetUrls: ['https://a.test'],
      };
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: session,
      } satisfies ExtensionMessage);

      controller.init();
      await flushPromises();

      expect(document.getElementById('status-label')?.textContent).toBe(
        'paused',
      );
      expect(document.getElementById('pause-label')?.textContent).toBe(
        'Resume',
      );
    });

    it('renders remove buttons for multi-target sessions', async () => {
      const session: ActiveSession = {
        sourceTabId: 1,
        targetTabIds: [2, 3],
        isPaused: false,
        sourceUrl: 's',
        targetUrls: ['a', 'b'],
      };
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: session,
      } satisfies ExtensionMessage);

      controller.init();
      await flushPromises();

      const removeButtons = document.querySelectorAll('.btn-remove-target');
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe('form submission', () => {
    beforeEach(async () => {
      controller.init();
      await flushPromises();
    });

    it('aborts when source validation fails', async () => {
      mockedValidateUrl.mockReturnValueOnce(null);

      (document.getElementById('source-url') as HTMLInputElement).value = 'bad';
      const form = document.getElementById('session-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const calls = (chrome.runtime.sendMessage as jest.Mock).mock.calls;
      const startCalls = calls.filter(
        (c) => c[0].type === ExtensionMessageTypeEnum.StartSession,
      );
      expect(startCalls).toHaveLength(0);
    });

    it('sends StartSession with validated source and targets', async () => {
      (document.getElementById('source-url') as HTMLInputElement).value =
        'src.test';
      const targetInput = document.querySelector<HTMLInputElement>(
        '#target-list input[type="url"]',
      );
      if (targetInput) targetInput.value = 'a.test';

      mockedValidateUrl
        .mockReturnValueOnce('https://src.test')
        .mockReturnValueOnce('https://a.test');

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStarted,
        payload: {
          sourceTabId: 1,
          targetTabIds: [2],
          isPaused: false,
          sourceUrl: 'https://src.test',
          targetUrls: ['https://a.test'],
        },
      } satisfies ExtensionMessage);

      const form = document.getElementById('session-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const startCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.StartSession);
      expect(startCalls).toHaveLength(1);
      expect(startCalls[0]).toEqual({
        type: ExtensionMessageTypeEnum.StartSession,
        payload: {
          sourceUrl: 'https://src.test',
          targetUrls: ['https://a.test'],
        },
      });
      expect(document.getElementById('active-card')?.hidden).toBe(false);
    });

    it('shows an error when backend returns SessionError', async () => {
      mockedValidateUrl.mockReturnValue('https://x.test');
      (document.getElementById('source-url') as HTMLInputElement).value = 'x';

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionError,
        error: 'boom',
      } satisfies ExtensionMessage);

      const form = document.getElementById('session-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      expect(document.getElementById('error-msg')?.textContent).toContain(
        'boom',
      );
      expect(document.getElementById('status-label')?.textContent).toBe(
        'error',
      );
    });

    it('does not submit when a target URL is invalid', async () => {
      mockedValidateUrl
        .mockReturnValueOnce('https://src.test')
        .mockReturnValueOnce(null);

      (document.getElementById('source-url') as HTMLInputElement).value = 'x';
      const targetInput = document.querySelector<HTMLInputElement>(
        '#target-list input[type="url"]',
      );
      if (targetInput) targetInput.value = 'bad';

      const form = document.getElementById('session-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      const startCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.StartSession);
      expect(startCalls).toHaveLength(0);
    });

    it('handles sendMessage rejection by showing an error', async () => {
      mockedValidateUrl.mockReturnValue('https://x.test');
      (document.getElementById('source-url') as HTMLInputElement).value = 'x';

      (chrome.runtime.sendMessage as jest.Mock).mockRejectedValueOnce(
        new Error('port closed'),
      );

      const form = document.getElementById('session-form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await flushPromises();

      expect(document.getElementById('error-msg')?.textContent).toContain(
        'port closed',
      );
    });
  });

  describe('active session actions', () => {
    async function initWithSession(overrides: Partial<ActiveSession> = {}) {
      const session: ActiveSession = {
        sourceTabId: 1,
        targetTabIds: [10, 11],
        isPaused: false,
        sourceUrl: 'https://src.test',
        targetUrls: ['https://a.test', 'https://b.test'],
        ...overrides,
      };
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: session,
      } satisfies ExtensionMessage);

      controller.init();
      await flushPromises();
      return session;
    }

    it('pause button sends PauseSession and applies resulting state', async () => {
      await initWithSession();

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: {
          sourceTabId: 1,
          targetTabIds: [10, 11],
          isPaused: true,
          sourceUrl: 'https://src.test',
          targetUrls: ['https://a.test', 'https://b.test'],
        },
      } satisfies ExtensionMessage);

      document.getElementById('pause-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      const pauseCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.PauseSession);
      expect(pauseCalls).toHaveLength(1);
      expect(document.getElementById('status-label')?.textContent).toBe(
        'paused',
      );
    });

    it('pause button sends ResumeSession when already paused', async () => {
      await initWithSession({ isPaused: true });

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: null,
      } satisfies ExtensionMessage);

      document.getElementById('pause-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      const resumeCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.ResumeSession);
      expect(resumeCalls).toHaveLength(1);
    });

    it('stop button sends ClearRecord to every target then StopSession', async () => {
      await initWithSession();

      document.getElementById('stop-btn')?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, {
        type: ExtensionMessageTypeEnum.ClearRecord,
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, {
        type: ExtensionMessageTypeEnum.ClearRecord,
      });
      const stopCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.StopSession);
      expect(stopCalls).toHaveLength(1);
      expect(document.getElementById('status-label')?.textContent).toBe('idle');
    });

    it('download JSON fires DownloadRecord to each target', async () => {
      await initWithSession();

      document
        .getElementById('download-json')
        ?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, {
        type: ExtensionMessageTypeEnum.DownloadRecord,
        payload: { format: DownloadFormatEnum.Json },
      });
    });

    it('download Text fires DownloadRecord to each target', async () => {
      await initWithSession();

      document
        .getElementById('download-text')
        ?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(11, {
        type: ExtensionMessageTypeEnum.DownloadRecord,
        payload: { format: DownloadFormatEnum.Text },
      });
    });

    it('remove target button sends RemoveTarget and reflects new session', async () => {
      await initWithSession();

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: {
          sourceTabId: 1,
          targetTabIds: [11],
          isPaused: false,
          sourceUrl: 'https://src.test',
          targetUrls: ['https://b.test'],
        },
      } satisfies ExtensionMessage);

      const removeBtn = document.querySelector<HTMLButtonElement>(
        '.btn-remove-target',
      );
      removeBtn?.dispatchEvent(new Event('click'));
      await flushPromises();

      const removeCalls = (chrome.runtime.sendMessage as jest.Mock).mock.calls
        .map((c) => c[0] as ExtensionMessage)
        .filter((m) => m.type === ExtensionMessageTypeEnum.RemoveTarget);
      expect(removeCalls).toHaveLength(1);
      expect(document.querySelectorAll('.btn-remove-target')).toHaveLength(0);
    });

    it('resets UI when RemoveTarget returns null payload (last target removed)', async () => {
      await initWithSession();

      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValueOnce({
        type: ExtensionMessageTypeEnum.SessionStatus,
        payload: null,
      } satisfies ExtensionMessage);

      document
        .querySelector<HTMLButtonElement>('.btn-remove-target')
        ?.dispatchEvent(new Event('click'));
      await flushPromises();

      expect(document.getElementById('active-card')?.hidden).toBe(true);
      expect(document.getElementById('status-label')?.textContent).toBe('idle');
    });
  });

  describe('info panel', () => {
    beforeEach(async () => {
      controller.init();
      await flushPromises();
    });

    it('opens and closes the info panel', () => {
      const infoBtn = document.getElementById('info-btn')!;
      const infoCloseBtn = document.getElementById('info-close-btn')!;
      const infoPanel = document.getElementById('info-panel')!;
      const form = document.getElementById('session-form')!;

      infoBtn.dispatchEvent(new Event('click'));
      expect(infoPanel.hidden).toBe(false);
      expect(form.hidden).toBe(true);
      expect(infoCloseBtn.hidden).toBe(false);

      infoCloseBtn.dispatchEvent(new Event('click'));
      expect(infoPanel.hidden).toBe(true);
      expect(form.hidden).toBe(false);
    });
  });

  describe('targets', () => {
    beforeEach(async () => {
      controller.init();
      await flushPromises();
    });

    it('adds new target inputs up to the max', () => {
      const addBtn = document.getElementById('add-target-btn')!;
      for (let i = 0; i < 9; i++) {
        addBtn.dispatchEvent(new Event('click'));
      }

      expect(
        document.querySelectorAll('#target-list input[type="url"]'),
      ).toHaveLength(10);
      expect(addBtn.hidden).toBe(true);
    });

    it('removes a target input and keeps at least one', () => {
      const addBtn = document.getElementById('add-target-btn')!;
      addBtn.dispatchEvent(new Event('click'));
      addBtn.dispatchEvent(new Event('click'));
      expect(
        document.querySelectorAll('#target-list input[type="url"]'),
      ).toHaveLength(3);

      const removeBtns = document.querySelectorAll<HTMLButtonElement>(
        '.btn-remove-input',
      );
      removeBtns[0].dispatchEvent(new Event('click'));

      expect(
        document.querySelectorAll('#target-list input[type="url"]'),
      ).toHaveLength(2);
    });

    it('replay link opens the replay page in a new tab', () => {
      const replayLink = document.getElementById('replay-link')!;
      replayLink.dispatchEvent(new Event('click'));

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/src/replay/index.html',
      });
    });
  });

  describe('source input validation', () => {
    beforeEach(async () => {
      controller.init();
      await flushPromises();
    });

    it('persists inputs on input event and debounces validation', () => {
      const src = document.getElementById('source-url') as HTMLInputElement;
      src.value = 'example.com';
      src.dispatchEvent(new Event('input'));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [INPUT_STORAGE_KEY]: expect.objectContaining({
          source: 'example.com',
        }),
      });

      mockedValidateUrl.mockClear();
      jest.advanceTimersByTime(700);
      expect(mockedValidateUrl).toHaveBeenCalledTimes(1);
    });

    it('validates on blur when non-empty', () => {
      const src = document.getElementById('source-url') as HTMLInputElement;
      src.value = 'example.com';
      mockedValidateUrl.mockClear();
      src.dispatchEvent(new Event('blur'));

      expect(mockedValidateUrl).toHaveBeenCalledTimes(1);
    });
  });
});
