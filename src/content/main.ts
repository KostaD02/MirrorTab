import {
  DownloadFormat,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  MirrorSettings,
  SessionRecord,
  SessionRole,
  SessionRoleEnum,
} from '@/shared/types';
import { FrameBridge, isTopFrame } from './frame-bridge';
import { EventCapture, EventReplay } from './mirror';
import { OverlayHost } from './overlay-host';
import { PseudoStyles } from './pseudo-styles';
import { RoleBadge } from './role-badge';
import { VirtualCursor } from './virtual-cursor';
import { loadSettings, logger, watchSettings } from '@/shared/util';
import { DEFAULT_SETTINGS } from '@/shared/consts';

// ? only the top frame draws overlays and downloads; child frames capture and replay their own DOM
const topFrame = isTopFrame();
const overlay = topFrame ? new OverlayHost() : null;
const cursor = overlay ? new VirtualCursor(overlay) : null;
const badge = overlay ? new RoleBadge(overlay) : null;
const bridge = new FrameBridge(cursor);
const capture = new EventCapture(bridge);
const pseudo = new PseudoStyles();
const replay = new EventReplay(bridge, pseudo);

let currentRole: SessionRole = SessionRoleEnum.Idle;
let settings: MirrorSettings = { ...DEFAULT_SETTINGS };

function applyOverlays(): void {
  badge?.update(settings.showRoleBadge ? currentRole : SessionRoleEnum.Idle);

  const wantsCursor =
    currentRole === SessionRoleEnum.Target ||
    currentRole === SessionRoleEnum.Replay;

  if (settings.showGhostCursor && wantsCursor) {
    cursor?.show();
  } else {
    cursor?.hide();
  }
}

function applySettings(next: MirrorSettings): void {
  settings = next;
  capture.setSettings(next);
  replay.setSettings(next);
  applyOverlays();
}

function applyRole(role: SessionRole): void {
  currentRole = role;
  if (role === SessionRoleEnum.Idle) pseudo.reset();
  capture.setRole(role);
  bridge.setRole(role);
  applyOverlays();
  logger.log(`Role set to: ${role}`);
}

loadSettings()
  .then(applySettings)
  .catch(() => undefined);

watchSettings(applySettings);

bridge.onResolved((_path, role) => {
  applyRole(role);
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case ExtensionMessageTypeEnum.SetRole: {
      applyRole(message.role);
      break;
    }

    case ExtensionMessageTypeEnum.ReplayEvent: {
      replay.replay(message.payload);
      break;
    }

    case ExtensionMessageTypeEnum.DownloadRecord: {
      if (!topFrame) break;
      downloadRecords(message.payload.format);
      break;
    }
  }
});

async function downloadRecords(format: DownloadFormat): Promise<void> {
  const request: ExtensionMessage = {
    type: ExtensionMessageTypeEnum.GetRecords,
  };
  try {
    const response = (await chrome.runtime.sendMessage(request)) as unknown as
      | ExtensionMessage
      | undefined;
    if (response?.type !== ExtensionMessageTypeEnum.Records) return;
    downloadRecord(format, response.payload);
  } catch (err) {
    logger.warn('Could not fetch session records', err);
  }
}

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
      `[${r.timestamp}] ${r.type} | selector stack trace: ${r.selectorStackTrace} | selector: ${r.selector} | content: ${JSON.stringify(r.content)}` +
      (r.framePath ? ` | frame: ${r.framePath}` : '');
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
