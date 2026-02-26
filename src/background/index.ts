import { sendRoleToTab } from '@/shared/util';
import { createMessageRouter } from './message-router';
import { SessionManager } from './session-manager';
import { SessionRoleEnum } from '@/shared/types';

const sessionManager = new SessionManager();

sessionManager.restore();

createMessageRouter(sessionManager);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessionManager.currentSession;
  if (!session || session.isPaused) return;
  if (changeInfo.status !== 'complete') return;

  if (tabId === session.sourceTabId) {
    sendRoleToTab(tabId, SessionRoleEnum.Source);
  } else if (tabId === session.targetTabId) {
    sendRoleToTab(tabId, SessionRoleEnum.Target);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const session = sessionManager.currentSession;
  if (!session) return;
  if (tabId === session.sourceTabId || tabId === session.targetTabId) {
    sessionManager.stop();
  }
});
