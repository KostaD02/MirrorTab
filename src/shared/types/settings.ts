export interface MirrorSettings {
  mirrorPasswordFields: boolean;
  showGhostCursor: boolean;
  showRoleBadge: boolean;
  mirrorMousemove: boolean;
  mirrorScroll: boolean;
  mirrorKeystrokes: boolean;
  smoothScroll: boolean;
  scrollDebounceMs: number;
  tabOpenDelayMs: number;
}

export type MirrorSettingKey = keyof MirrorSettings;

export type MirrorSettingBooleanKey = {
  [K in keyof MirrorSettings]: MirrorSettings[K] extends boolean ? K : never;
}[keyof MirrorSettings];

export type MirrorSettingNumberKey = {
  [K in keyof MirrorSettings]: MirrorSettings[K] extends number ? K : never;
}[keyof MirrorSettings];
