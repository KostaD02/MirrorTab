import { ExtensionMessageTypeEnum, SessionRoleEnum } from '@/shared/types';
import { chrome } from 'jest-chrome';
import { logger } from '../logger/logger';
import { normaliseUrl } from '../url/url';
import { openTab, waitForTabLoad, sendRoleToTab } from './tab';

jest.mock('../logger/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('../url/url', () => ({
  normaliseUrl: jest.fn((url: string) => url),
}));

describe('Tab utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
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
});
