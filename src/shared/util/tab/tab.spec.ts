import { ExtensionMessageTypeEnum, SessionRoleEnum } from '@/shared/types';
import { chrome } from 'jest-chrome';
import { logger } from '../logger/logger';
import { normaliseUrl } from '../url/url';
import {
  openTab,
  waitForTabLoad,
  sendRoleToTab,
  injectContentScript,
} from './tab';

jest.mock('../logger/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('../url/url', () => ({
  normaliseUrl: jest.fn((url: string) => url),
}));

describe('Tab utils', () => {
  let executeScriptMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    const chromeScripting = ((
      chrome as unknown as { scripting: { executeScript: jest.Mock } }
    ).scripting = {
      executeScript: jest.fn(),
    });
    executeScriptMock = chromeScripting.executeScript;
    executeScriptMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('openTab', () => {
    test('creates a new tab with normalized URL and inactive', async () => {
      (chrome.tabs.create as jest.Mock).mockResolvedValue({
        id: 123,
      } as unknown as chrome.tabs.Tab);

      const url = 'http://example.com';
      const result = await openTab(url);

      expect(normaliseUrl).toHaveBeenCalledWith(url);
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url, active: false });
      expect(result.id).toBe(123);
    });
  });

  describe('waitForTabLoad', () => {
    test('resolves immediately if tab is already complete', async () => {
      (chrome.tabs.get as jest.Mock).mockResolvedValue({
        status: 'complete',
      } as unknown as chrome.tabs.Tab);

      await expect(waitForTabLoad(1)).resolves.toBeUndefined();
    });
  });

  describe('sendRoleToTab', () => {
    test('sends role message immediately if sendMessage succeeds', async () => {
      const tabId = 1;
      (chrome.tabs.sendMessage as jest.Mock).mockResolvedValue(undefined);

      await sendRoleToTab(tabId, SessionRoleEnum.Source);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(tabId, {
        type: ExtensionMessageTypeEnum.SetRole,
        role: SessionRoleEnum.Source,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('injectContentScript', () => {
    test('calls chrome.scripting.executeScript with tabId', async () => {
      executeScriptMock.mockResolvedValue(undefined);

      const tabId = 1;
      await injectContentScript(tabId);

      expect(executeScriptMock).toHaveBeenCalledWith({
        target: { tabId },
        files: ['src/content/main.ts'],
      });
    });

    test('does not throw if executeScript fails', async () => {
      executeScriptMock.mockRejectedValue(new Error('already injected'));
      await expect(injectContentScript(1)).resolves.toBeUndefined();
    });
  });
});
