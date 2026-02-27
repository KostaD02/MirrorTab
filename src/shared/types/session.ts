import { DomEventContent, DomEventType } from './dom-events';

export const SessionRoleEnum = {
  Idle: 'idle',
  Source: 'source',
  Target: 'target',
} as const;

export type SessionRole =
  (typeof SessionRoleEnum)[keyof typeof SessionRoleEnum];

export interface SessionConfig {
  sourceUrl: string;
  targetUrl: string;
}

export interface ActiveSession extends SessionConfig {
  sourceTabId: number;
  targetTabId: number;
  isPaused: boolean;
}

export interface SessionRecord {
  timestamp: string;
  selectorStackTrace: string;
  selector: string;
  type: DomEventType;
  content: DomEventContent;
}
