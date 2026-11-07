import { RECORDS_STORAGE_KEY } from '@/shared/consts';
import { SessionRecord } from '@/shared/types';
import { logger } from '@/shared/util';

type StoredRecords = Record<string, SessionRecord[]>;

const PERSIST_DELAY_MS = 250;

// ? records replayed on a tab live here, not in the tab, so they survive navigation and come from every frame
export class RecordStore {
  private readonly records = new Map<number, SessionRecord[]>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  async restore(): Promise<void> {
    const data = await chrome.storage.local.get(RECORDS_STORAGE_KEY);
    const stored = data[RECORDS_STORAGE_KEY] as StoredRecords | undefined;
    if (!stored) return;

    for (const [key, list] of Object.entries(stored)) {
      const tabId = Number(key);
      this.records.set(tabId, [...list, ...(this.records.get(tabId) ?? [])]);
    }
  }

  add(tabId: number, record: SessionRecord): void {
    const list = this.records.get(tabId);
    if (list) {
      list.push(record);
    } else {
      this.records.set(tabId, [record]);
    }
    this.schedulePersist();
  }

  get(tabId: number): SessionRecord[] {
    return [...(this.records.get(tabId) ?? [])];
  }

  clear(tabId?: number): void {
    if (tabId === undefined) {
      this.records.clear();
    } else if (!this.records.delete(tabId)) {
      return;
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, PERSIST_DELAY_MS);
  }

  private async persist(): Promise<void> {
    try {
      if (this.records.size === 0) {
        await chrome.storage.local.remove(RECORDS_STORAGE_KEY);
        return;
      }
      const stored: StoredRecords = {};
      for (const [tabId, list] of this.records) {
        stored[String(tabId)] = list;
      }
      await chrome.storage.local.set({ [RECORDS_STORAGE_KEY]: stored });
    } catch (err) {
      logger.warn('Could not persist session records', err);
    }
  }
}
