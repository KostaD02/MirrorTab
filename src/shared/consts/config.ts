export const APP_NAME = 'MirrorTab';

export const REPLAY_SPEEDS = {
  Slow: 0.5,
  Normal: 1,
  Fast: 1.5,
} as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[keyof typeof REPLAY_SPEEDS];
