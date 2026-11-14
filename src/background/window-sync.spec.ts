import { chrome } from 'jest-chrome';
import { ActiveSession } from '@/shared/types';
import { WindowSync } from './window-sync';

jest.mock('@/shared/util', () => ({
  ...jest.requireActual('@/shared/util'),
  logger: { warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

const SESSION: ActiveSession = {
  sourceTabId: 1,
  targetTabIds: [2, 3],
  isPaused: false,
  sourceUrl: 'https://src.test',
  targetUrls: ['https://a.test', 'https://b.test'],
};

const SCREEN = { left: 0, top: 0, width: 1600, height: 900 };

// ? reported from a target window of 800x700, so the browser itself takes 16x100
const VIEWPORT = { width: 784, height: 600 };

type Tabs = Record<number, number>;

function stubTabs(tabs: Tabs): void {
  (chrome.tabs.get as unknown as jest.Mock).mockImplementation(
    (tabId: number) =>
      tabId in tabs
        ? Promise.resolve({ id: tabId, windowId: tabs[tabId] })
        : Promise.reject(new Error('no such tab')),
  );
}

function stubWindows(
  windows: Record<number, { width: number; height: number; state?: string }>,
): void {
  (chrome.windows.get as unknown as jest.Mock).mockImplementation(
    (windowId: number) =>
      Promise.resolve({ id: windowId, state: 'normal', ...windows[windowId] }),
  );
}

function windowUpdates(): [number, Record<string, unknown>][] {
  return (chrome.windows.update as unknown as jest.Mock).mock.calls as [
    number,
    Record<string, unknown>,
  ][];
}

describe('WindowSync', () => {
  let sync: WindowSync;

  beforeEach(() => {
    jest.clearAllMocks();
    sync = new WindowSync();
    (chrome.windows.update as unknown as jest.Mock).mockResolvedValue({});
    (chrome.windows.create as unknown as jest.Mock).mockResolvedValue({
      id: 77,
    });
    (chrome.tabs.move as unknown as jest.Mock).mockResolvedValue([]);
  });

  describe('apply', () => {
    it('resizes a target window so its viewport matches the source', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700 } });
      await sync.report(2, VIEWPORT);

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toEqual([[20, { width: 1016, height: 600 }]]);
    });

    it('updates a shared target window once', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700 } });
      await sync.report(2, VIEWPORT);
      await sync.report(3, VIEWPORT);

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toHaveLength(1);
    });

    it('leaves a target sharing the source window alone', async () => {
      stubTabs({ 1: 10, 2: 10, 3: 10 });
      stubWindows({ 10: { width: 800, height: 700 } });
      await sync.report(2, VIEWPORT);

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toEqual([]);
    });

    it('waits for a target to report its own viewport before resizing it', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700 } });

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toEqual([]);
    });

    it('forgets a viewport once its tab is gone', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700 } });
      await sync.report(2, VIEWPORT);
      sync.forget(2);

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toEqual([]);
    });

    it('restores a maximized window before giving it a size', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700, state: 'maximized' } });
      await sync.report(2, VIEWPORT);

      await sync.apply(SESSION, { width: 1000, height: 500 });

      expect(windowUpdates()).toEqual([
        [20, { state: 'normal' }],
        [20, { width: 1016, height: 600 }],
      ]);
    });
  });

  describe('tile', () => {
    it('gathers the targets in a window beside the source', async () => {
      stubTabs({ 1: 10, 2: 10, 3: 10 });
      stubWindows({
        10: { width: 800, height: 700 },
        77: { width: 800, height: 900 },
      });

      await sync.tile(SESSION, SCREEN);

      expect(chrome.windows.create).toHaveBeenCalledWith({
        tabId: 2,
        left: 800,
        top: 0,
        width: 800,
        height: 900,
      });
      expect(chrome.tabs.move).toHaveBeenCalledWith([3], {
        windowId: 77,
        index: -1,
      });
      expect(windowUpdates()).toEqual([
        [10, { left: 0, top: 0, width: 800, height: 900 }],
      ]);
    });

    it('reuses a window the targets already share', async () => {
      stubTabs({ 1: 10, 2: 20, 3: 20 });
      stubWindows({
        10: { width: 800, height: 700 },
        20: { width: 800, height: 700 },
      });

      await sync.tile(SESSION, SCREEN);

      expect(chrome.windows.create).not.toHaveBeenCalled();
      expect(windowUpdates()).toEqual([
        [20, { left: 800, top: 0, width: 800, height: 900 }],
        [10, { left: 0, top: 0, width: 800, height: 900 }],
      ]);
    });

    it('still gathers the targets when the browser refuses the bounds', async () => {
      stubTabs({ 1: 10, 2: 10, 3: 10 });
      stubWindows({
        10: { width: 800, height: 700 },
        77: { width: 800, height: 600 },
      });
      (chrome.windows.create as unknown as jest.Mock)
        .mockRejectedValueOnce(
          new Error('Bounds must be at least 50% within visible screen space.'),
        )
        .mockResolvedValueOnce({ id: 77 });

      await sync.tile(SESSION, SCREEN);

      expect(chrome.windows.create).toHaveBeenLastCalledWith({ tabId: 2 });
      expect(chrome.tabs.move).toHaveBeenCalledWith([3], {
        windowId: 77,
        index: -1,
      });
      expect(windowUpdates()).toEqual([
        [77, { left: 800, top: 0, width: 800, height: 900 }],
        [10, { left: 0, top: 0, width: 800, height: 900 }],
      ]);
    });

    it('does nothing when the source tab is gone', async () => {
      stubTabs({ 2: 20, 3: 20 });
      stubWindows({ 20: { width: 800, height: 700 } });

      await sync.tile(SESSION, SCREEN);

      expect(chrome.windows.create).not.toHaveBeenCalled();
      expect(windowUpdates()).toEqual([]);
    });
  });
});
