import {
  DownloadFormat,
  ExtensionMessage,
  ExtensionMessageTypeEnum,
  SessionRecord,
} from '@/shared/types';
import { EventCapture, EventReplay } from './mirror';
import { RoleBadge } from './role-badge';
import { logger } from '@/shared/util';

const capture = new EventCapture();
const replay = new EventReplay();
const badge = new RoleBadge();

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  switch (message.type) {
    case ExtensionMessageTypeEnum.SetRole: {
      capture.setRole(message.role);
      badge.update(message.role);
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
