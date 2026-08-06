import {
  DownloadFormat,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  MirrorSettings,
  SessionRecord,
  SessionRole,
  SessionRoleEnum,
} from '@/shared/types';
import { EventCapture, EventReplay } from './mirror';
import { RoleBadge } from './role-badge';
import { VirtualCursor } from './virtual-cursor';
import { loadSettings, logger, watchSettings } from '@/shared/util';
import { DEFAULT_SETTINGS } from '@/shared/consts';

const cursor = new VirtualCursor();
const capture = new EventCapture();
const replay = new EventReplay(cursor);
const badge = new RoleBadge();

let currentRole: SessionRole = SessionRoleEnum.Idle;
let settings: MirrorSettings = { ...DEFAULT_SETTINGS };

function applyOverlays(): void {
  badge.update(settings.showRoleBadge ? currentRole : SessionRoleEnum.Idle);

  const wantsCursor =
    currentRole === SessionRoleEnum.Target ||
    currentRole === SessionRoleEnum.Replay;

  if (settings.showGhostCursor && wantsCursor) {
    cursor.show();
  } else {
    cursor.hide();
  }
}

function applySettings(next: MirrorSettings): void {
  settings = next;
  capture.setSettings(next);
  replay.setSettings(next);
  applyOverlays();
}

loadSettings()
  .then(applySettings)
  .catch(() => undefined);

watchSettings(applySettings);

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case ExtensionMessageTypeEnum.SetRole: {
      currentRole = message.role;
      capture.setRole(message.role);
      applyOverlays();
      logger.log(`Role set to: ${message.role}`);
      break;
    }

    case ExtensionMessageTypeEnum.ReplayEvent: {
      replay.replay(message.payload);
      break;
    }

    case ExtensionMessageTypeEnum.DownloadRecord: {
      downloadRecord(message.payload.format, replay.sessionRecords);
      break;
    }

    case ExtensionMessageTypeEnum.ClearRecord: {
      replay.clear();
      break;
    }
  }
});

function downloadRecord(
  format: DownloadFormat,
  records: ReadonlyArray<SessionRecord>,
): void {
  let content: string;
  let mimeType: string;
  let extension: string;

  if (format === 'json') {
    content = JSON.stringify(records, null, 2);
    mimeType = 'application/json';
    extension = 'json';
  } else {
    const formatRecord = (r: SessionRecord) =>
      `[${r.timestamp}] ${r.type} | selector stack trace: ${r.selectorStackTrace} | selector: ${r.selector} | content: ${JSON.stringify(r.content)}`;
    content = records.map(formatRecord).join('\n');
    mimeType = 'text/plain';
    extension = 'txt';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mirrortab-session-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
}
