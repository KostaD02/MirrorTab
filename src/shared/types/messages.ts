import { DomEventPayload } from './dom-events';
import { DownloadFormat } from './download';
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
  DownloadRecord: 'download-record',
  ClearRecord: 'clear-record',
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
  | { type: typeof ExtensionMessageTypeEnum.DownloadRecord, payload: { format: DownloadFormat } }
  | { type: typeof ExtensionMessageTypeEnum.ClearRecord }
  | {
      type: typeof ExtensionMessageTypeEnum.SessionStatus;
      payload: ActiveSession | null;
    };

export type ExtensionMessageType = ExtensionMessage['type'];
