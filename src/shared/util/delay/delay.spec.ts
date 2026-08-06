import { chrome } from 'jest-chrome';
import { KEEPALIVE_INTERVAL_MS } from '../../consts';
import { sleep, sleepKeepingWorkerAlive } from './delay';

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the requested time', async () => {
    const done = jest.fn();
    void sleep(500).then(done);

    jest.advanceTimersByTime(499);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toHaveBeenCalled();
  });
});

describe('sleepKeepingWorkerAlive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (chrome.runtime.getPlatformInfo as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function drain(): Promise<void> {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    }
  }

  it('sleeps in one chunk and never pings for a short delay', async () => {
    const done = jest.fn();
    void sleepKeepingWorkerAlive(5000).then(done);

    jest.advanceTimersByTime(5000);
    await drain();

    expect(done).toHaveBeenCalled();
    expect(chrome.runtime.getPlatformInfo).not.toHaveBeenCalled();
  });

  it('pings between chunks so MV3 does not terminate the worker mid-wait', async () => {
    const done = jest.fn();
    void sleepKeepingWorkerAlive(KEEPALIVE_INTERVAL_MS * 3).then(done);

    await drain();

    expect(done).toHaveBeenCalled();
    expect(chrome.runtime.getPlatformInfo).toHaveBeenCalledTimes(2);
  });

  it('resolves immediately for a zero delay', async () => {
    const done = jest.fn();
    void sleepKeepingWorkerAlive(0).then(done);

    await drain();

    expect(done).toHaveBeenCalled();
    expect(chrome.runtime.getPlatformInfo).not.toHaveBeenCalled();
  });
});
