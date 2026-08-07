import { KEEPALIVE_INTERVAL_MS } from '../../consts';

export async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function sleepKeepingWorkerAlive(ms: number): Promise<void> {
  let remaining = ms;

  while (remaining > 0) {
    const chunk = Math.min(remaining, KEEPALIVE_INTERVAL_MS);
    await sleep(chunk);
    remaining -= chunk;

    if (remaining > 0) {
      await chrome.runtime.getPlatformInfo();
    }
  }
}
