import {
  DEFAULT_SETTINGS,
  SCROLL_DEBOUNCE_MAX_MS,
  SCROLL_DEBOUNCE_MIN_MS,
  SETTINGS_STORAGE_KEY,
  TAB_OPEN_DELAY_MAX_MS,
  TAB_OPEN_DELAY_MIN_MS,
} from '../../consts';
import { MirrorSettings } from '../../types/settings';

export function clampScrollDebounce(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.scrollDebounceMs;
  return Math.min(
    SCROLL_DEBOUNCE_MAX_MS,
    Math.max(SCROLL_DEBOUNCE_MIN_MS, Math.round(value)),
  );
}

export function clampTabOpenDelay(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.tabOpenDelayMs;
  return Math.min(
    TAB_OPEN_DELAY_MAX_MS,
    Math.max(TAB_OPEN_DELAY_MIN_MS, Math.round(value)),
  );
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normaliseSettings(raw: unknown): MirrorSettings {
  const stored =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<Record<keyof MirrorSettings, unknown>>)
      : {};

  return {
    mirrorPasswordFields: bool(
      stored.mirrorPasswordFields,
      DEFAULT_SETTINGS.mirrorPasswordFields,
    ),
    showGhostCursor: bool(
      stored.showGhostCursor,
      DEFAULT_SETTINGS.showGhostCursor,
    ),
    showRoleBadge: bool(stored.showRoleBadge, DEFAULT_SETTINGS.showRoleBadge),
    mirrorMousemove: bool(
      stored.mirrorMousemove,
      DEFAULT_SETTINGS.mirrorMousemove,
    ),
    mirrorScroll: bool(stored.mirrorScroll, DEFAULT_SETTINGS.mirrorScroll),
    mirrorKeystrokes: bool(
      stored.mirrorKeystrokes,
      DEFAULT_SETTINGS.mirrorKeystrokes,
    ),
    smoothScroll: bool(stored.smoothScroll, DEFAULT_SETTINGS.smoothScroll),
    scrollDebounceMs:
      typeof stored.scrollDebounceMs === 'number'
        ? clampScrollDebounce(stored.scrollDebounceMs)
        : DEFAULT_SETTINGS.scrollDebounceMs,
    tabOpenDelayMs:
      typeof stored.tabOpenDelayMs === 'number'
        ? clampTabOpenDelay(stored.tabOpenDelayMs)
        : DEFAULT_SETTINGS.tabOpenDelayMs,
  };
}

export async function loadSettings(): Promise<MirrorSettings> {
  try {
    const data = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const raw: unknown = data[SETTINGS_STORAGE_KEY];
    return normaliseSettings(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: MirrorSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export function watchSettings(
  onChange: (settings: MirrorSettings) => void,
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!(SETTINGS_STORAGE_KEY in changes)) return;
    const raw: unknown = changes[SETTINGS_STORAGE_KEY].newValue;
    onChange(normaliseSettings(raw));
  });
}
