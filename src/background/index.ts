import { sendRoleToTab } from '@/shared/util';
import { SessionRoleEnum } from '@/shared/types';
import { createMessageRouter } from './message-router';
import { RecordStore } from './record-store';
import { SessionManager } from './session-manager';

const recordStore = new RecordStore();
const sessionManager = new SessionManager(recordStore);

sessionManager.restore();
recordStore.restore();

createMessageRouter(sessionManager, recordStore);

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

  const session = sessionManager.currentSession;
  if (!session) return;

  if (tabId === session.sourceTabId) {
    sessionManager.stop();
  } else if (session.targetTabIds.includes(tabId)) {
    sessionManager.removeTarget(tabId);
  }
});
