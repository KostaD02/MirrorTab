import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import { openTab, sendRoleToTab, t, waitForTabLoad } from '@/shared/util';
import { RecordStore } from './record-store';
import { SessionManager } from './session-manager';
import { WindowSync } from './window-sync';

export function createMessageRouter(
  sessionManager: SessionManager,
  recordStore: RecordStore,
  windowSync: WindowSync = new WindowSync(),
): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: ExtensionMessage) => void,
    ) => {
      switch (message.type) {
        case ExtensionMessageTypeEnum.StartSession: {
          sessionManager.start(message.payload, sendResponse);
          return true;
        }

        case ExtensionMessageTypeEnum.PauseSession: {
          sessionManager.pause().then(() => {
            sendResponse({
              type: ExtensionMessageTypeEnum.SessionStatus,
              payload: sessionManager.currentSession,
            });
          });
          return true;
        }

        case ExtensionMessageTypeEnum.ResumeSession: {
          sessionManager.resume().then(() => {
            sendResponse({
              type: ExtensionMessageTypeEnum.SessionStatus,
              payload: sessionManager.currentSession,
            });
          });
          return true;
        }

        case ExtensionMessageTypeEnum.StopSession: {
          sessionManager.stop();
          break;
        }

        case ExtensionMessageTypeEnum.GetSession: {
          sendResponse({
            type: ExtensionMessageTypeEnum.SessionStatus,
            payload: sessionManager.currentSession,
          });
          break;
        }

        case ExtensionMessageTypeEnum.DomEvent: {
          const session = sessionManager.currentSession;
          if (!session || session.isPaused) break;
          if (sender.tab?.id !== session.sourceTabId) break;
          for (const targetTabId of session.targetTabIds) {
            // ? a target still parked on the pending page has no content script yet
            chrome.tabs
              .sendMessage(targetTabId, {
                type: ExtensionMessageTypeEnum.ReplayEvent,
                payload: message.payload,
              })
              .catch(() => undefined);
          }
          break;
        }

        case ExtensionMessageTypeEnum.RecordEvent: {
          const tabId = sender.tab?.id;
          if (tabId !== undefined) recordStore.add(tabId, message.payload);
          break;
        }

        case ExtensionMessageTypeEnum.GetRecords: {
          const tabId = sender.tab?.id;
          sendResponse({
            type: ExtensionMessageTypeEnum.Records,
            payload: tabId === undefined ? [] : recordStore.get(tabId),
          });
          break;
        }

        case ExtensionMessageTypeEnum.RemoveTarget: {
          sessionManager.removeTarget(message.payload.targetTabId).then(() => {
            sendResponse({
              type: ExtensionMessageTypeEnum.SessionStatus,
              payload: sessionManager.currentSession,
            });
          });
          return true;
        }

        case ExtensionMessageTypeEnum.StartReplay: {
          openTab(message.payload.url)
            .then((tab) => {
              const targetTabId = Number(tab.id);
              if (isNaN(targetTabId)) {
                throw new Error('Failed to create replay tab');
              }
              return waitForTabLoad(targetTabId).then(() => targetTabId);
            })
            .then((targetTabId) => {
              return sendRoleToTab(targetTabId, SessionRoleEnum.Replay).then(
                () => targetTabId,
              );
            })
            .then((targetTabId) => {
              sendResponse({
                type: ExtensionMessageTypeEnum.ReplayReady,
                payload: { targetTabId },
              });
            })
            .catch(() => {
              sendResponse({
                type: ExtensionMessageTypeEnum.SessionError,
                error: t('errorOpenReplayTab'),
              });
            });
          return true;
        }

        case ExtensionMessageTypeEnum.Viewport: {
          const tabId = sender.tab?.id;
          if (tabId === undefined) break;
          void windowSync.report(tabId, message.payload);

          const session = sessionManager.currentSession;
          if (!session || session.isPaused) break;
          if (tabId !== session.sourceTabId) break;
          void windowSync.apply(session, message.payload);
          break;
        }

        case ExtensionMessageTypeEnum.TileWindows: {
          const session = sessionManager.currentSession;
          if (!session) {
            sendResponse({
              type: ExtensionMessageTypeEnum.SessionStatus,
              payload: null,
            });
            break;
          }
          windowSync
            .tile(session, message.payload.screen)
            .then(() => {
              sendResponse({
                type: ExtensionMessageTypeEnum.SessionStatus,
                payload: sessionManager.currentSession,
              });
            })
            .catch((err: unknown) => {
              sendResponse({
                type: ExtensionMessageTypeEnum.SessionError,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          return true;
        }

        case ExtensionMessageTypeEnum.StopReplay: {
          recordStore.clear(message.payload.targetTabId);
          sendRoleToTab(message.payload.targetTabId, SessionRoleEnum.Idle);
          break;
        }

        default: {
          break;
        }
      }
    },
  );
}
