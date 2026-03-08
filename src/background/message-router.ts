import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import { openTab, sendRoleToTab, waitForTabLoad } from '@/shared/util';
import { SessionManager } from './session-manager';

export function createMessageRouter(sessionManager: SessionManager): void {
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
          chrome.tabs.sendMessage(session.targetTabId, {
            type: ExtensionMessageTypeEnum.ReplayEvent,
            payload: message.payload,
          });
          break;
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
                error: 'Failed to open replay tab',
              });
            });
          return true;
        }

        case ExtensionMessageTypeEnum.StopReplay: {
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
