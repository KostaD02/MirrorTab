import { sendRoleToTab, usageCounter } from '@/shared/util';
import { SessionRoleEnum } from '@/shared/types';
import { createMessageRouter } from './message-router';
import { RecordStore } from './record-store';
import { SessionManager } from './session-manager';
import { WindowSync } from './window-sync';

const recordStore = new RecordStore();
// ? one counter for the whole worker, so a session and a replay never overwrite each other's count
const usage = usageCounter();
const sessionManager = new SessionManager(recordStore, usage);
const windowSync = new WindowSync();

sessionManager.restore();
recordStore.restore();

createMessageRouter(sessionManager, recordStore, windowSync, usage);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessionManager.currentSession;
  if (!session || session.isPaused) return;
  if (changeInfo.status !== 'complete') return;

  if (tabId === session.sourceTabId) {
    sendRoleToTab(tabId, SessionRoleEnum.Source);
  } else if (session.targetTabIds.includes(tabId)) {
    sendRoleToTab(tabId, SessionRoleEnum.Target);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  recordStore.clear(tabId);
  windowSync.forget(tabId);

  const session = sessionManager.currentSession;
  if (!session) return;

  if (tabId === session.sourceTabId) {
    sessionManager.stop();
  } else if (session.targetTabIds.includes(tabId)) {
    sessionManager.removeTarget(tabId);
  }
});
