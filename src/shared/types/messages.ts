import { DomEventPayload } from './dom-events';
import { ActiveSession, SessionConfig, SessionRole } from './session';

export const ExtensionMessageTypeEnum = {
  StartSession: 'start-session',
  StopSession: 'stop-session',
  PauseSession: 'pause-session',
  ResumeSession: 'resume-session',
  GetSession: 'get-session',
  SessionStarted: 'session-started',
  SessionError: 'session-error',
  SessionStatus: 'session-status',
  DomEvent: 'dom-event',
  ReplayEvent: 'replay-event',
  SetRole: 'set-role',
} as const;

// prettier-ignore
export type ExtensionMessage =
  | { type: typeof ExtensionMessageTypeEnum.StartSession; payload: SessionConfig }
  | { type: typeof ExtensionMessageTypeEnum.StopSession }
  | { type: typeof ExtensionMessageTypeEnum.PauseSession }
  | { type: typeof ExtensionMessageTypeEnum.ResumeSession }
  | { type: typeof ExtensionMessageTypeEnum.GetSession }
  | { type: typeof ExtensionMessageTypeEnum.SessionStarted; payload: ActiveSession }
  | { type: typeof ExtensionMessageTypeEnum.SessionError; error: string }
  | { type: typeof ExtensionMessageTypeEnum.DomEvent; payload: DomEventPayload }
  | { type: typeof ExtensionMessageTypeEnum.ReplayEvent; payload: DomEventPayload }
  | { type: typeof ExtensionMessageTypeEnum.SetRole; role: SessionRole }
  | {
      type: typeof ExtensionMessageTypeEnum.SessionStatus;
      payload: ActiveSession | null;
    };

export type ExtensionMessageType = ExtensionMessage['type'];
