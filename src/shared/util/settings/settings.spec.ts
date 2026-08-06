import { chrome } from 'jest-chrome';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../../consts';
import { MirrorSettings } from '../../types/settings';
import {
  clampScrollDebounce,
  clampTabOpenDelay,
  loadSettings,
  normaliseSettings,
  saveSettings,
  watchSettings,
} from './settings';

describe('clampScrollDebounce', () => {
  it('keeps values inside the supported range', () => {
    expect(clampScrollDebounce(0)).toBe(0);
    expect(clampScrollDebounce(120)).toBe(120);
    expect(clampScrollDebounce(2000)).toBe(2000);
  });

  it('clamps out-of-range values to the bounds', () => {
    expect(clampScrollDebounce(-50)).toBe(0);
    expect(clampScrollDebounce(99999)).toBe(2000);
  });

  it('rounds fractional values', () => {
    expect(clampScrollDebounce(49.6)).toBe(50);
  });

  it('falls back to the default for non-finite values', () => {
    expect(clampScrollDebounce(NaN)).toBe(DEFAULT_SETTINGS.scrollDebounceMs);
    expect(clampScrollDebounce(Infinity)).toBe(
      DEFAULT_SETTINGS.scrollDebounceMs,
    );
    expect(clampScrollDebounce(Number.NEGATIVE_INFINITY)).toBe(
      DEFAULT_SETTINGS.scrollDebounceMs,
    );
  });
});

describe('clampTabOpenDelay', () => {
  it('keeps values inside the supported range', () => {
    expect(clampTabOpenDelay(0)).toBe(0);
    expect(clampTabOpenDelay(10000)).toBe(10000);
    expect(clampTabOpenDelay(60000)).toBe(60000);
  });

  it('clamps out-of-range values to the bounds', () => {
    expect(clampTabOpenDelay(-1)).toBe(0);
    expect(clampTabOpenDelay(120000)).toBe(60000);
  });

  it('falls back to the default for non-finite values', () => {
    expect(clampTabOpenDelay(NaN)).toBe(DEFAULT_SETTINGS.tabOpenDelayMs);
    expect(clampTabOpenDelay(Infinity)).toBe(DEFAULT_SETTINGS.tabOpenDelayMs);
  });
});

describe('normaliseSettings', () => {
  it('returns the defaults for missing or non-object input', () => {
    expect(normaliseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('does not mirror password fields by default', () => {
    expect(DEFAULT_SETTINGS.mirrorPasswordFields).toBe(false);
    expect(normaliseSettings({}).mirrorPasswordFields).toBe(false);
  });

  it('keeps stored booleans', () => {
    const stored = {
      mirrorPasswordFields: true,
      showGhostCursor: false,
      showRoleBadge: false,
      mirrorMousemove: false,
      mirrorScroll: false,
      mirrorKeystrokes: false,
      smoothScroll: false,
      scrollDebounceMs: 250,
      tabOpenDelayMs: 5000,
    } satisfies MirrorSettings;

    expect(normaliseSettings(stored)).toEqual(stored);
  });

  it('backfills settings missing from an older stored object', () => {
    const result = normaliseSettings({ showGhostCursor: false });

    expect(result.showGhostCursor).toBe(false);
    expect(result.showRoleBadge).toBe(DEFAULT_SETTINGS.showRoleBadge);
    expect(result.mirrorScroll).toBe(DEFAULT_SETTINGS.mirrorScroll);
    expect(result.scrollDebounceMs).toBe(DEFAULT_SETTINGS.scrollDebounceMs);
  });

  it('ignores values of the wrong type', () => {
    const result = normaliseSettings({
      showGhostCursor: 'yes',
      scrollDebounceMs: 'fast',
    });

    expect(result.showGhostCursor).toBe(DEFAULT_SETTINGS.showGhostCursor);
    expect(result.scrollDebounceMs).toBe(DEFAULT_SETTINGS.scrollDebounceMs);
  });

  it('clamps a stored debounce that is out of range', () => {
    expect(normaliseSettings({ scrollDebounceMs: -10 }).scrollDebounceMs).toBe(
      0,
    );
    expect(
      normaliseSettings({ scrollDebounceMs: 999999 }).scrollDebounceMs,
    ).toBe(2000);
  });

  it('defaults the tab open delay to off and clamps stored values', () => {
    expect(DEFAULT_SETTINGS.tabOpenDelayMs).toBe(0);
    expect(normaliseSettings({}).tabOpenDelayMs).toBe(0);
    expect(normaliseSettings({ tabOpenDelayMs: 10000 }).tabOpenDelayMs).toBe(
      10000,
    );
    expect(normaliseSettings({ tabOpenDelayMs: 999999 }).tabOpenDelayMs).toBe(
      60000,
    );
    expect(normaliseSettings({ tabOpenDelayMs: 'slow' }).tabOpenDelayMs).toBe(
      0,
    );
  });
});

describe('loadSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads and normalises the stored object', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({
      [SETTINGS_STORAGE_KEY]: { mirrorMousemove: false },
    });

    const settings = await loadSettings();

    expect(chrome.storage.local.get).toHaveBeenCalledWith(
      SETTINGS_STORAGE_KEY,
    );
    expect(settings.mirrorMousemove).toBe(false);
    expect(settings.mirrorScroll).toBe(true);
  });

  it('returns the defaults when nothing is stored', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the defaults when storage rejects', async () => {
    (chrome.storage.local.get as jest.Mock).mockRejectedValue(
      new Error('storage unavailable'),
    );

    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('writes the settings under the settings key', async () => {
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

    await saveSettings(DEFAULT_SETTINGS);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS,
    });
  });
});

describe('watchSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.storage.onChanged.clearListeners();
  });

  it('reports normalised settings when the settings key changes', () => {
    const onChange = jest.fn();
    watchSettings(onChange);

    chrome.storage.onChanged.callListeners(
      { [SETTINGS_STORAGE_KEY]: { newValue: { smoothScroll: false } } },
      'local',
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({
      ...DEFAULT_SETTINGS,
      smoothScroll: false,
    });
  });

  it('ignores changes to other storage areas', () => {
    const onChange = jest.fn();
    watchSettings(onChange);

    chrome.storage.onChanged.callListeners(
      { [SETTINGS_STORAGE_KEY]: { newValue: { smoothScroll: false } } },
      'sync',
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores changes to unrelated keys', () => {
    const onChange = jest.fn();
    watchSettings(onChange);

    chrome.storage.onChanged.callListeners(
      { SOMETHING_ELSE: { newValue: 1 } },
      'local',
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
