import { chrome } from 'jest-chrome';
import {
  ActiveSession,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import { openTab, sendRoleToTab, waitForTabLoad } from '@/shared/util';
import { createMessageRouter } from './message-router';
import { SessionManager } from './session-manager';

jest.mock('@/shared/util', () => ({
  openTab: jest.fn(),
  sendRoleToTab: jest.fn(),
  waitForTabLoad: jest.fn(),
}));

const mockedOpenTab = openTab as jest.MockedFunction<typeof openTab>;
const mockedSendRoleToTab = sendRoleToTab as jest.MockedFunction<
  typeof sendRoleToTab
>;
const mockedWaitForTabLoad = waitForTabLoad as jest.MockedFunction<
  typeof waitForTabLoad
>;

type Listener = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionMessage) => void,
) => boolean | void;

describe('createMessageRouter', () => {
  let manager: jest.Mocked<
    Pick<
      SessionManager,
      'start' | 'pause' | 'resume' | 'stop' | 'removeTarget'
    >
  > & { currentSession: ActiveSession | null };

  let listener: Listener;

  beforeEach(() => {
    jest.clearAllMocks();

    chrome.runtime.onMessage.clearListeners();

    const captured: { fn: Listener | null } = { fn: null };
    const addListenerSpy = jest
      .spyOn(chrome.runtime.onMessage, 'addListener')
      .mockImplementation((l) => {
        captured.fn = l as unknown as Listener;
      });

    manager = {
      start: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      removeTarget: jest.fn().mockResolvedValue(undefined),
      currentSession: null,
    };

    createMessageRouter(manager as unknown as SessionManager);

    if (!captured.fn) throw new Error('listener was not registered');
    listener = captured.fn;
    addListenerSpy.mockRestore();

    mockedSendRoleToTab.mockResolvedValue(undefined);
    mockedWaitForTabLoad.mockResolvedValue(undefined);
  });

  it('delegates StartSession to sessionManager.start and keeps channel open', () => {
    const sendResponse = jest.fn();
    const payload = {
      sourceUrl: 'https://src.test',
      targetUrls: ['https://a.test'],
    };

    const result = listener(
      { type: ExtensionMessageTypeEnum.StartSession, payload },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);
    expect(manager.start).toHaveBeenCalledWith(payload, sendResponse);
  });

  it('responds with SessionStatus after PauseSession', async () => {
    manager.currentSession = {
      sourceTabId: 1,
      targetTabIds: [2],
      isPaused: true,
      sourceUrl: 'a',
      targetUrls: ['b'],
    };
    const sendResponse = jest.fn();

    const result = listener(
      { type: ExtensionMessageTypeEnum.PauseSession },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);
    await flushPromises();

    expect(manager.pause).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      type: ExtensionMessageTypeEnum.SessionStatus,
      payload: manager.currentSession,
    });
  });

  it('responds with SessionStatus after ResumeSession', async () => {
    manager.currentSession = {
      sourceTabId: 1,
      targetTabIds: [2],
      isPaused: false,
      sourceUrl: 'a',
      targetUrls: ['b'],
    };
    const sendResponse = jest.fn();

    listener(
      { type: ExtensionMessageTypeEnum.ResumeSession },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    await flushPromises();

    expect(manager.resume).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      type: ExtensionMessageTypeEnum.SessionStatus,
      payload: manager.currentSession,
    });
  });

  it('delegates StopSession to sessionManager.stop without responding', () => {
    const sendResponse = jest.fn();

    const result = listener(
      { type: ExtensionMessageTypeEnum.StopSession },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(manager.stop).toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('responds with current session for GetSession', () => {
    manager.currentSession = null;
    const sendResponse = jest.fn();

    listener(
      { type: ExtensionMessageTypeEnum.GetSession },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(sendResponse).toHaveBeenCalledWith({
      type: ExtensionMessageTypeEnum.SessionStatus,
      payload: null,
    });
  });

  describe('DomEvent', () => {
    it('forwards to every target tab when sender is source and session is active', () => {
      manager.currentSession = {
        sourceTabId: 10,
        targetTabIds: [20, 30],
        isPaused: false,
        sourceUrl: 'a',
        targetUrls: ['b', 'c'],
      };
      const payload = { selector: '#x' } as never;

      listener(
        { type: ExtensionMessageTypeEnum.DomEvent, payload },
        { tab: { id: 10 } } as chrome.runtime.MessageSender,
        jest.fn(),
      );

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(20, {
        type: ExtensionMessageTypeEnum.ReplayEvent,
        payload,
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(30, {
        type: ExtensionMessageTypeEnum.ReplayEvent,
        payload,
      });
    });

    it('ignores DomEvent when there is no session', () => {
      manager.currentSession = null;

      listener(
        {
          type: ExtensionMessageTypeEnum.DomEvent,
          payload: {} as never,
        },
        { tab: { id: 10 } } as chrome.runtime.MessageSender,
        jest.fn(),
      );

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores DomEvent when the session is paused', () => {
      manager.currentSession = {
        sourceTabId: 10,
        targetTabIds: [20],
        isPaused: true,
        sourceUrl: 'a',
        targetUrls: ['b'],
      };

      listener(
        {
          type: ExtensionMessageTypeEnum.DomEvent,
          payload: {} as never,
        },
        { tab: { id: 10 } } as chrome.runtime.MessageSender,
        jest.fn(),
      );

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it('ignores DomEvent when sender tab is not the source', () => {
      manager.currentSession = {
        sourceTabId: 10,
        targetTabIds: [20],
        isPaused: false,
        sourceUrl: 'a',
        targetUrls: ['b'],
      };

      listener(
        {
          type: ExtensionMessageTypeEnum.DomEvent,
          payload: {} as never,
        },
        { tab: { id: 99 } } as chrome.runtime.MessageSender,
        jest.fn(),
      );

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  it('responds with SessionStatus after RemoveTarget', async () => {
    manager.currentSession = {
      sourceTabId: 1,
      targetTabIds: [3],
      isPaused: false,
      sourceUrl: 'a',
      targetUrls: ['c'],
    };
    const sendResponse = jest.fn();

    const result = listener(
      {
        type: ExtensionMessageTypeEnum.RemoveTarget,
        payload: { targetTabId: 2 },
      },
      {} as chrome.runtime.MessageSender,
      sendResponse,
    );

    expect(result).toBe(true);
    await flushPromises();

    expect(manager.removeTarget).toHaveBeenCalledWith(2);
    expect(sendResponse).toHaveBeenCalledWith({
      type: ExtensionMessageTypeEnum.SessionStatus,
      payload: manager.currentSession,
    });
  });

  describe('StartReplay', () => {
    it('opens a tab, waits for load, sets Replay role, responds with ReplayReady', async () => {
      mockedOpenTab.mockResolvedValue({ id: 42 } as unknown as chrome.tabs.Tab);

      const sendResponse = jest.fn();
      const result = listener(
        {
          type: ExtensionMessageTypeEnum.StartReplay,
          payload: { url: 'https://replay.test' },
        },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      expect(result).toBe(true);
      await flushPromises();

      expect(mockedOpenTab).toHaveBeenCalledWith('https://replay.test');
      expect(mockedWaitForTabLoad).toHaveBeenCalledWith(42);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        42,
        SessionRoleEnum.Replay,
      );
      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.ReplayReady,
        payload: { targetTabId: 42 },
      });
    });

    it('responds with SessionError when the replay tab has no id', async () => {
      mockedOpenTab.mockResolvedValue({
        id: undefined,
      } as unknown as chrome.tabs.Tab);

      const sendResponse = jest.fn();
      listener(
        {
          type: ExtensionMessageTypeEnum.StartReplay,
          payload: { url: 'https://replay.test' },
        },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.SessionError,
        error: 'Failed to open replay tab',
      });
    });

    it('responds with SessionError when openTab rejects', async () => {
      mockedOpenTab.mockRejectedValue(new Error('nope'));

      const sendResponse = jest.fn();
      listener(
        {
          type: ExtensionMessageTypeEnum.StartReplay,
          payload: { url: 'https://replay.test' },
        },
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      await flushPromises();

      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.SessionError,
        error: 'Failed to open replay tab',
      });
    });
  });

  it('sends Idle role on StopReplay', () => {
    listener(
      {
        type: ExtensionMessageTypeEnum.StopReplay,
        payload: { targetTabId: 77 },
      },
      {} as chrome.runtime.MessageSender,
      jest.fn(),
    );

    expect(mockedSendRoleToTab).toHaveBeenCalledWith(77, SessionRoleEnum.Idle);
  });
});

async function flushPromises(): Promise<void> {
  // Resolve any pending microtasks including chained `.then(...)` calls
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}
