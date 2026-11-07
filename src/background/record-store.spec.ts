import { chrome } from 'jest-chrome';
import { RECORDS_STORAGE_KEY } from '@/shared/consts';
import { DomEventTypeEnum, SessionRecord } from '@/shared/types';
import { logger } from '@/shared/util';
import { RecordStore } from './record-store';

jest.mock('@/shared/util', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const record = (selector: string): SessionRecord => ({
  timestamp: '2026-04-24T10:00:00.000Z',
  framePath: '',
  selector,
  selectorStackTrace: selector,
  type: DomEventTypeEnum.Click,
  content: { offsetXRatio: 0, offsetYRatio: 0 },
});

describe('RecordStore', () => {
  let store: RecordStore;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    store = new RecordStore();
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.storage.local.remove as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps records per tab and hands out copies', () => {
    store.add(1, record('a'));
    store.add(1, record('b'));
    store.add(2, record('c'));

    const first = store.get(1);
    first.push(record('x'));

    expect(store.get(1).map((r) => r.selector)).toEqual(['a', 'b']);
    expect(store.get(2).map((r) => r.selector)).toEqual(['c']);
    expect(store.get(3)).toEqual([]);
  });

  it('clears one tab or everything', () => {
    store.add(1, record('a'));
    store.add(2, record('b'));

    store.clear(1);
    expect(store.get(1)).toEqual([]);
    expect(store.get(2)).toHaveLength(1);

    store.clear();
    expect(store.get(2)).toEqual([]);
  });

  it('persists once after a burst of additions', async () => {
    store.add(1, record('a'));
    store.add(1, record('b'));
    jest.advanceTimersByTime(249);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await Promise.resolve();

    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [RECORDS_STORAGE_KEY]: { '1': [record('a'), record('b')] },
    });
  });

  it('removes the storage key when nothing is left', async () => {
    store.add(1, record('a'));
    store.clear();
    jest.advanceTimersByTime(250);
    await Promise.resolve();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      RECORDS_STORAGE_KEY,
    );
  });

  it('does not persist when clearing a tab that has no records', () => {
    store.clear(7);
    jest.advanceTimersByTime(250);

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('restores stored records in front of records added meanwhile', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      [RECORDS_STORAGE_KEY]: { '1': [record('old')], '2': [record('two')] },
    });
    store.add(1, record('new'));

    await store.restore();

    expect(store.get(1).map((r) => r.selector)).toEqual(['old', 'new']);
    expect(store.get(2).map((r) => r.selector)).toEqual(['two']);
  });

  it('restores nothing when storage is empty', async () => {
    await store.restore();

    expect(store.get(1)).toEqual([]);
  });

  it('warns instead of throwing when persisting fails', async () => {
    (chrome.storage.local.set as jest.Mock).mockRejectedValue(
      new Error('quota'),
    );
    store.add(1, record('a'));
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not persist session records',
      expect.any(Error),
    );
  });
});
