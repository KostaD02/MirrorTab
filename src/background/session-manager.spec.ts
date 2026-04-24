import { chrome } from 'jest-chrome';
import {
  ActiveSession,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
} from '@/shared/types';
import {
  RECORDS_STORAGE_KEY,
  STORAGE_KEY,
} from '@/shared/consts';
import { openTab, sendRoleToTab, waitForTabLoad } from '@/shared/util';
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

const makeTab = (id: number) =>
  ({ id }) as unknown as chrome.tabs.Tab;

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new SessionManager();

    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.storage.local.remove as jest.Mock).mockResolvedValue(undefined);
    (chrome.tabs.update as jest.Mock).mockResolvedValue(undefined);

    mockedSendRoleToTab.mockResolvedValue(undefined);
    mockedWaitForTabLoad.mockResolvedValue(undefined);
  });

  describe('restore', () => {
    it('sets the current session from storage when present', async () => {
      const saved: ActiveSession = {
        sourceTabId: 1,
        targetTabIds: [2, 3],
        isPaused: false,
        sourceUrl: 'https://src.test',
        targetUrls: ['https://a.test', 'https://b.test'],
      };
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        [STORAGE_KEY]: saved,
      });

      await manager.restore();

      expect(chrome.storage.local.get).toHaveBeenCalledWith(STORAGE_KEY);
      expect(manager.currentSession).toEqual(saved);
    });

    it('leaves current session null when nothing is stored', async () => {
      await manager.restore();

      expect(manager.currentSession).toBeNull();
    });
  });

  describe('start', () => {
    it('creates tabs, assigns roles, activates source, persists, and responds with SessionStarted', async () => {
      mockedOpenTab
        .mockResolvedValueOnce(makeTab(10))
        .mockResolvedValueOnce(makeTab(20))
        .mockResolvedValueOnce(makeTab(30));

      const sendResponse = jest.fn();
      await manager.start(
        {
          sourceUrl: 'https://src.test',
          targetUrls: ['https://a.test', 'https://b.test'],
        },
        sendResponse,
      );

      expect(mockedOpenTab).toHaveBeenCalledTimes(3);
      expect(mockedWaitForTabLoad).toHaveBeenCalledTimes(3);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        10,
        SessionRoleEnum.Source,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        20,
        SessionRoleEnum.Target,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        30,
        SessionRoleEnum.Target,
      );
      expect(chrome.tabs.update).toHaveBeenCalledWith(10, { active: true });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [STORAGE_KEY]: expect.objectContaining({
          sourceTabId: 10,
          targetTabIds: [20, 30],
          isPaused: false,
        }),
      });

      expect(manager.currentSession).toEqual({
        sourceTabId: 10,
        targetTabIds: [20, 30],
        isPaused: false,
        sourceUrl: 'https://src.test',
        targetUrls: ['https://a.test', 'https://b.test'],
      });

      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.SessionStarted,
        payload: manager.currentSession,
      });
    });

    it('responds with SessionError when tab creation returns an invalid id', async () => {
      mockedOpenTab
        .mockResolvedValueOnce({ id: undefined } as unknown as chrome.tabs.Tab)
        .mockResolvedValueOnce(makeTab(20));

      const sendResponse = jest.fn();
      await manager.start(
        { sourceUrl: 'https://src.test', targetUrls: ['https://a.test'] },
        sendResponse,
      );

      expect(manager.currentSession).toBeNull();
      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.SessionError,
        error: 'Failed to create tabs',
      });
    });

    it('responds with SessionError when openTab rejects', async () => {
      mockedOpenTab.mockRejectedValue(new Error('boom'));

      const sendResponse = jest.fn();
      await manager.start(
        { sourceUrl: 'https://src.test', targetUrls: ['https://a.test'] },
        sendResponse,
      );

      expect(sendResponse).toHaveBeenCalledWith({
        type: ExtensionMessageTypeEnum.SessionError,
        error: 'boom',
      });
    });
  });

  describe('pause', () => {
    it('marks the session paused and sends Idle role to all tabs', async () => {
      await primeSession(manager, { isPaused: false });

      await manager.pause();

      expect(manager.currentSession?.isPaused).toBe(true);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        1,
        SessionRoleEnum.Idle,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        2,
        SessionRoleEnum.Idle,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        3,
        SessionRoleEnum.Idle,
      );
    });

    it('is a no-op when there is no session', async () => {
      await manager.pause();

      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('is a no-op when the session is already paused', async () => {
      await primeSession(manager, { isPaused: true });
      jest.clearAllMocks();

      await manager.pause();

      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('clears the paused flag and re-sends Source/Target roles', async () => {
      await primeSession(manager, { isPaused: true });

      await manager.resume();

      expect(manager.currentSession?.isPaused).toBe(false);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        1,
        SessionRoleEnum.Source,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        2,
        SessionRoleEnum.Target,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        3,
        SessionRoleEnum.Target,
      );
    });

    it('is a no-op when not paused', async () => {
      await primeSession(manager, { isPaused: false });
      jest.clearAllMocks();

      await manager.resume();

      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('clears the session, removes storage keys, and sets all tabs Idle', async () => {
      await primeSession(manager, { isPaused: false });

      await manager.stop();

      expect(manager.currentSession).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEY,
        RECORDS_STORAGE_KEY,
      ]);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        1,
        SessionRoleEnum.Idle,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        2,
        SessionRoleEnum.Idle,
      );
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        3,
        SessionRoleEnum.Idle,
      );
    });

    it('is a no-op when there is no session', async () => {
      await manager.stop();

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
    });
  });

  describe('removeTarget', () => {
    it('removes only the matching target and persists', async () => {
      await primeSession(manager, { isPaused: false });

      await manager.removeTarget(2);

      expect(manager.currentSession?.targetTabIds).toEqual([3]);
      expect(manager.currentSession?.targetUrls).toEqual(['https://b.test']);
      expect(mockedSendRoleToTab).toHaveBeenCalledWith(
        2,
        SessionRoleEnum.Idle,
      );
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('stops the session when removing the last target', async () => {
      await primeSession(manager, {
        isPaused: false,
        targetTabIds: [2],
        targetUrls: ['https://a.test'],
      });

      await manager.removeTarget(2);

      expect(manager.currentSession).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        STORAGE_KEY,
        RECORDS_STORAGE_KEY,
      ]);
    });

    it('ignores unknown tab ids', async () => {
      await primeSession(manager, { isPaused: false });
      jest.clearAllMocks();

      await manager.removeTarget(999);

      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('is a no-op when there is no session', async () => {
      await manager.removeTarget(2);

      expect(mockedSendRoleToTab).not.toHaveBeenCalled();
    });
  });
});

async function primeSession(
  manager: SessionManager,
  overrides: Partial<ActiveSession>,
): Promise<ActiveSession> {
  mockedOpenTab
    .mockResolvedValueOnce(makeTab(1))
    .mockResolvedValueOnce(makeTab(2))
    .mockResolvedValueOnce(makeTab(3));

  const captured: { value: ActiveSession | null } = { value: null };
  const sendResponse = (msg: ExtensionMessage) => {
    if (msg.type === ExtensionMessageTypeEnum.SessionStarted) {
      captured.value = msg.payload;
    }
  };

  await manager.start(
    {
      sourceUrl: 'https://src.test',
      targetUrls: ['https://a.test', 'https://b.test'],
    },
    sendResponse,
  );

  const base = manager.currentSession;
  if (!base) throw new Error('primeSession: no session started');
  Object.assign(base, overrides);
  return base;
}
