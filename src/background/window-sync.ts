import { ActiveSession, ScreenArea, ViewportSize } from '@/shared/types';
import { logger } from '@/shared/util';

async function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

// ? every tab in a session reports the viewport it has; the source's is the one the others follow
export class WindowSync {
  private readonly frames = new Map<number, ViewportSize>();

  // ? the window is measured right next to the size the tab reports, so both come from the same moment;
  // ? the difference is the browser's own chrome, which stays the same whatever size the window is given
  async report(tabId: number, size: ViewportSize): Promise<void> {
    const tab = await getTab(tabId);
    if (!tab) return;

    try {
      const window = await chrome.windows.get(tab.windowId);
      if (window.width === undefined || window.height === undefined) return;
      this.frames.set(tabId, {
        width: window.width - size.width,
        height: window.height - size.height,
      });
    } catch (err) {
      logger.warn('Could not measure the window of a tab', err);
    }
  }

  forget(tabId: number): void {
    this.frames.delete(tabId);
  }

  async apply(session: ActiveSession, size: ViewportSize): Promise<void> {
    const source = await getTab(session.sourceTabId);
    if (!source) return;

    // ? a target sharing the source's window already has its viewport, and resizing it would fight back
    const windows = new Map<number, number>();
    for (const tabId of session.targetTabIds) {
      const tab = await getTab(tabId);
      if (!tab || tab.windowId === source.windowId) continue;
      if (!windows.has(tab.windowId)) windows.set(tab.windowId, tabId);
    }

    for (const [windowId, tabId] of windows) {
      await this.resize(windowId, tabId, size);
    }
  }

  // ? the source keeps the window it is in, the targets gather in one beside it
  async tile(session: ActiveSession, screen: ScreenArea): Promise<void> {
    const source = await getTab(session.sourceTabId);
    if (!source) return;

    const targets: chrome.tabs.Tab[] = [];
    for (const tabId of session.targetTabIds) {
      const tab = await getTab(tabId);
      if (tab) targets.push(tab);
    }
    if (targets.length === 0) return;

    const half = Math.floor(screen.width / 2);
    const right = {
      left: screen.left + half,
      top: screen.top,
      width: screen.width - half,
      height: screen.height,
    };

    const windowId = targets[0].windowId;
    const gathered =
      windowId !== source.windowId &&
      targets.every((tab) => tab.windowId === windowId);

    if (gathered) {
      await this.place(windowId, right);
    } else {
      await this.gather(targets, right);
    }

    await this.place(source.windowId, {
      left: screen.left,
      top: screen.top,
      width: half,
      height: screen.height,
    });
  }

  private async gather(
    targets: chrome.tabs.Tab[],
    bounds: ScreenArea,
  ): Promise<void> {
    const [first, ...rest] = targets.map((tab) => Number(tab.id));
    const windowId = await this.createWindow(first, bounds);
    if (windowId === undefined) return;
    if (rest.length > 0) {
      await chrome.tabs.move(rest, { windowId, index: -1 });
    }
  }

  // ? a browser that reads the screen differently rejects the bounds outright; the window is worth having anyway
  private async createWindow(
    tabId: number,
    bounds: ScreenArea,
  ): Promise<number | undefined> {
    try {
      const created = await chrome.windows.create({ tabId, ...bounds });
      return created?.id;
    } catch (err) {
      logger.warn('Could not open the target window in place', err);
      const created = await chrome.windows.create({ tabId });
      const windowId = created?.id;
      if (windowId !== undefined) await this.place(windowId, bounds);
      return windowId;
    }
  }

  private async resize(
    windowId: number,
    tabId: number,
    size: ViewportSize,
  ): Promise<void> {
    // ? without a report there is no way to tell how much of the window the browser itself takes
    const frame = this.frames.get(tabId);
    if (!frame) return;

    await this.place(windowId, {
      width: size.width + frame.width,
      height: size.height + frame.height,
    });
  }

  // ? bounds are ignored while a window is maximized or in full screen, so it is restored first
  private async place(
    windowId: number,
    bounds: Partial<ScreenArea>,
  ): Promise<void> {
    try {
      const window = await chrome.windows.get(windowId);
      if (window.state !== 'normal') {
        await chrome.windows.update(windowId, { state: 'normal' });
      }
      await chrome.windows.update(windowId, bounds);
    } catch (err) {
      logger.warn('Could not place the window', err);
    }
  }
}
