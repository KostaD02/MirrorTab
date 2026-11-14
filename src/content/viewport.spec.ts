/**
 * @jest-environment jsdom
 */

import { chrome } from 'jest-chrome';
import {
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRoleEnum,
  ViewportSize,
} from '@/shared/types';
import { ViewportReporter } from './viewport';

function sentViewports(): ViewportSize[] {
  return (chrome.runtime.sendMessage as jest.Mock).mock.calls
    .map((call) => call[0] as ExtensionMessage)
    .filter((message) => message.type === ExtensionMessageTypeEnum.Viewport)
    .map((message) => (message as { payload: ViewportSize }).payload);
}

// ? the window around the viewport is what the browser's own chrome takes up
const FRAME = { width: 16, height: 100 };

function resizeTo(width: number, height: number): void {
  const sizes = {
    innerWidth: width,
    innerHeight: height,
    outerWidth: width + FRAME.width,
    outerHeight: height + FRAME.height,
  };
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(window, name, { value, configurable: true });
  }
  window.dispatchEvent(new Event('resize'));
}

describe('ViewportReporter', () => {
  // One instance for the whole file: it listens on `window`, and jsdom keeps
  // every listener a new instance would add, so each test would be reported twice.
  let reporter: ViewportReporter;

  beforeAll(() => {
    reporter = new ViewportReporter();
  });

  beforeEach(() => {
    jest.useFakeTimers();
    reporter.setRole(SessionRoleEnum.Idle);
    jest.clearAllMocks();
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays quiet while the tab has no role in a session', () => {
    resizeTo(800, 600);
    jest.advanceTimersByTime(500);

    expect(sentViewports()).toEqual([]);
  });

  it('reports the viewport as soon as the tab becomes the source', () => {
    resizeTo(1024, 768);
    jest.clearAllMocks();

    reporter.setRole(SessionRoleEnum.Source);

    expect(sentViewports()).toEqual([
      { width: 1024, height: 768 },
    ]);
  });

  it('reports the viewport of a target too, so its window frame can be measured', () => {
    resizeTo(900, 700);
    jest.clearAllMocks();

    reporter.setRole(SessionRoleEnum.Target);

    expect(sentViewports()).toEqual([
      { width: 900, height: 700 },
    ]);
  });

  it('sends one report for a burst of resizes', () => {
    reporter.setRole(SessionRoleEnum.Source);
    jest.clearAllMocks();

    resizeTo(1000, 800);
    resizeTo(900, 800);
    resizeTo(820, 640);
    expect(sentViewports()).toEqual([]);

    jest.advanceTimersByTime(200);

    expect(sentViewports()).toEqual([
      { width: 820, height: 640 },
    ]);
  });

  it('stops reporting once the session lets the tab go', () => {
    reporter.setRole(SessionRoleEnum.Source);
    reporter.setRole(SessionRoleEnum.Idle);
    jest.clearAllMocks();

    resizeTo(640, 480);
    jest.advanceTimersByTime(200);

    expect(sentViewports()).toEqual([]);
  });
});
