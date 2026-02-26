import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRole,
} from '../types';
import { normaliseUrl } from './url';
import { MAX_RETRY_ATTEMPTS, RETRY_DELAY_MS } from '../consts';
import { logger } from './logger';

export async function openTab(url: string): Promise<chrome.tabs.Tab> {
  return chrome.tabs.create({ url: normaliseUrl(url), active: false });
}

export async function waitForTabLoad(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;

  return new Promise((resolve) => {
    const listener = (
      id: number,
      _info: chrome.tabs.OnUpdatedInfo,
      updatedTab: chrome.tabs.Tab,
    ) => {
      if (id === tabId && updatedTab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function sendRoleToTab(
  tabId: number,
  role: SessionRole,
): Promise<void> {
  const msg: ExtensionMessage = {
    type: ExtensionMessageTypeEnum.SetRole,
    role,
  };

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, msg);
      return;
    } catch {
      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  logger.warn(
    `Could not deliver SET_ROLE:${role} to tab ${tabId.toString()} after ${MAX_RETRY_ATTEMPTS.toString()} attempts`,
  );
}

export async function injectContentScript(tabId: number): Promise<void> {
  try {
    // TODO: check files on built version
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/main.ts'],
    });
  } catch {
    // Already injected via manifest
  }
}
