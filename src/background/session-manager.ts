import { STORAGE_KEY } from '@/shared/consts';
import {
  ActiveSession,
  ExtensionMessage,
  SessionConfig,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import {
  injectContentScript,
  openTab,
  sendRoleToTab,
  waitForTabLoad,
} from '@/shared/util';

export class SessionManager {
  private session: ActiveSession | null = null;

  get currentSession(): ActiveSession | null {
    return this.session;
  }

  async restore(): Promise<void> {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    if (data[STORAGE_KEY]) {
      this.session = data[STORAGE_KEY] as ActiveSession;
    }
  }

  async start(
    config: SessionConfig,
    sendResponse: (msg: ExtensionMessage) => void,
  ): Promise<void> {
    try {
      const [sourceTab, targetTab] = await Promise.all([
        openTab(config.sourceUrl),
        openTab(config.targetUrl),
      ]);

      const sourceTabId = Number(sourceTab.id);
      const targetTabId = Number(targetTab.id);

      if (isNaN(sourceTabId) || isNaN(targetTabId)) {
        throw new Error('Failed to create tabs');
      }

      await Promise.all([
        waitForTabLoad(sourceTabId),
        waitForTabLoad(targetTabId),
      ]);

      await Promise.all([
        injectContentScript(sourceTabId),
        injectContentScript(targetTabId),
      ]);

      await Promise.all([
        sendRoleToTab(sourceTabId, SessionRoleEnum.Source),
        sendRoleToTab(targetTabId, SessionRoleEnum.Target),
      ]);

      await chrome.tabs.update(sourceTabId, { active: true });

      this.session = {
        sourceTabId,
        targetTabId,
        isPaused: false,
        sourceUrl: config.sourceUrl,
        targetUrl: config.targetUrl,
      };

      await this.persist();

      sendResponse({
        type: ExtensionMessageTypeEnum.SessionStarted,
        payload: this.session,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({
        type: ExtensionMessageTypeEnum.SessionError,
        error,
      });
    }
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.isPaused) return;
    this.session.isPaused = true;
    await this.persist();
    await Promise.all([
      sendRoleToTab(this.session.sourceTabId, SessionRoleEnum.Idle),
      sendRoleToTab(this.session.targetTabId, SessionRoleEnum.Idle),
    ]);
  }

  async resume(): Promise<void> {
    if (!this.session || !this.session.isPaused) return;
    this.session.isPaused = false;
    await this.persist();
    await Promise.all([
      sendRoleToTab(this.session.sourceTabId, SessionRoleEnum.Source),
      sendRoleToTab(this.session.targetTabId, SessionRoleEnum.Target),
    ]);
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    const { sourceTabId, targetTabId } = this.session;
    this.session = null;
    await this.persist();
    await Promise.all([
      sendRoleToTab(sourceTabId, SessionRoleEnum.Idle),
      sendRoleToTab(targetTabId, SessionRoleEnum.Idle),
    ]);
  }

  private async persist(): Promise<void> {
    if (this.session) {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.session });
    } else {
      await chrome.storage.local.remove(STORAGE_KEY);
    }
  }
}
