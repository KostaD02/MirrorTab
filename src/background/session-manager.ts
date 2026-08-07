import { STORAGE_KEY, RECORDS_STORAGE_KEY } from '@/shared/consts';
import {
  ActiveSession,
  ExtensionMessage,
  SessionConfig,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import {
  buildPendingUrl,
  clampTabOpenDelay,
  loadSettings,
  navigateTab,
  openRawTab,
  openTab,
  sendRoleToTab,
  sleepKeepingWorkerAlive,
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
      const settings = await loadSettings();
      const delayMs = clampTabOpenDelay(settings.tabOpenDelayMs);
      const staggered = delayMs > 0;
      const startedAt = Date.now();

      const [sourceTab, ...targetTabs] = await Promise.all([
        openTab(config.sourceUrl),
        ...config.targetUrls.map((url, i) =>
          staggered
            ? openRawTab(buildPendingUrl(url, startedAt + delayMs * (i + 1)))
            : openTab(url),
        ),
      ]);

      const sourceTabId = Number(sourceTab.id);
      const targetTabIds = targetTabs.map((t) => Number(t.id));

      if (isNaN(sourceTabId) || targetTabIds.some(isNaN)) {
        throw new Error('Failed to create tabs');
      }

      if (staggered) {
        await waitForTabLoad(sourceTabId);
        await sendRoleToTab(sourceTabId, SessionRoleEnum.Source);
      } else {
        await Promise.all([
          waitForTabLoad(sourceTabId),
          ...targetTabIds.map((id) => waitForTabLoad(id)),
        ]);

        await Promise.all([
          sendRoleToTab(sourceTabId, SessionRoleEnum.Source),
          ...targetTabIds.map((id) => sendRoleToTab(id, SessionRoleEnum.Target)),
        ]);
      }

      await chrome.tabs.update(sourceTabId, { active: true });

      this.session = {
        sourceTabId,
        targetTabIds,
        isPaused: false,
        sourceUrl: config.sourceUrl,
        targetUrls: config.targetUrls,
      };

      await this.persist();

      sendResponse({
        type: ExtensionMessageTypeEnum.SessionStarted,
        payload: this.session,
      });

      if (staggered) {
        void this.staggerTargets(
          [...targetTabIds],
          [...config.targetUrls],
          delayMs,
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      sendResponse({
        type: ExtensionMessageTypeEnum.SessionError,
        error,
      });
    }
  }

  private async staggerTargets(
    targetTabIds: number[],
    targetUrls: string[],
    delayMs: number,
  ): Promise<void> {
    for (let i = 0; i < targetTabIds.length; i++) {
      const tabId = targetTabIds[i];

      await sleepKeepingWorkerAlive(delayMs);

      if (!this.isActiveTarget(tabId)) continue;

      try {
        await navigateTab(tabId, targetUrls[i]);
        await waitForTabLoad(tabId);
        if (!this.isActiveTarget(tabId)) continue;
        await sendRoleToTab(tabId, SessionRoleEnum.Target);
      } catch {
        await this.removeTarget(tabId);
      }
    }
  }

  private isActiveTarget(tabId: number): boolean {
    return this.session?.targetTabIds.includes(tabId) ?? false;
  }

  async pause(): Promise<void> {
    if (!this.session || this.session.isPaused) return;
    this.session.isPaused = true;
    await this.persist();
    await Promise.all([
      sendRoleToTab(this.session.sourceTabId, SessionRoleEnum.Idle),
      ...this.session.targetTabIds.map((id) =>
        sendRoleToTab(id, SessionRoleEnum.Idle),
      ),
    ]);
  }

  async resume(): Promise<void> {
    if (!this.session || !this.session.isPaused) return;
    this.session.isPaused = false;
    await this.persist();
    await Promise.all([
      sendRoleToTab(this.session.sourceTabId, SessionRoleEnum.Source),
      ...this.session.targetTabIds.map((id) =>
        sendRoleToTab(id, SessionRoleEnum.Target),
      ),
    ]);
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    const { sourceTabId, targetTabIds } = this.session;
    this.session = null;
    await this.persist();
    await Promise.all([
      sendRoleToTab(sourceTabId, SessionRoleEnum.Idle),
      ...targetTabIds.map((id) => sendRoleToTab(id, SessionRoleEnum.Idle)),
    ]);
  }

  async removeTarget(targetTabId: number): Promise<void> {
    if (!this.session) return;

    const idx = this.session.targetTabIds.indexOf(targetTabId);
    if (idx === -1) return;

    this.session.targetTabIds.splice(idx, 1);
    this.session.targetUrls.splice(idx, 1);
    await sendRoleToTab(targetTabId, SessionRoleEnum.Idle);

    if (this.session.targetTabIds.length === 0) {
      await this.stop();
      return;
    }

    await this.persist();
  }

  private async persist(): Promise<void> {
    if (this.session) {
      await chrome.storage.local.set({ [STORAGE_KEY]: this.session });
    } else {
      await chrome.storage.local.remove([STORAGE_KEY, RECORDS_STORAGE_KEY]);
    }
  }
}
