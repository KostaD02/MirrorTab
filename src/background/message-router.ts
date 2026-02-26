import { ExtensionMessage, ExtensionMessageTypeEnum } from '@/shared/types';
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

        default: {
          break;
        }
      }
    },
  );
}
