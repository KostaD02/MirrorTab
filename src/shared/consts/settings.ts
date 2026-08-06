import { MirrorSettings } from '../types/settings';

export const DEFAULT_SETTINGS: MirrorSettings = {
  mirrorPasswordFields: false,
  showGhostCursor: true,
  showRoleBadge: true,
  mirrorMousemove: true,
  mirrorScroll: true,
  mirrorKeystrokes: true,
  smoothScroll: true,
  scrollDebounceMs: 50,
  tabOpenDelayMs: 0,
};

export const SCROLL_DEBOUNCE_MIN_MS = 0;
export const SCROLL_DEBOUNCE_MAX_MS = 2000;

export const TAB_OPEN_DELAY_MIN_MS = 0;
export const TAB_OPEN_DELAY_MAX_MS = 60000;

export const KEEPALIVE_INTERVAL_MS = 20000;
