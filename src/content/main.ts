import { ExtensionMessage, ExtensionMessageTypeEnum } from '@/shared/types';
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
  }
});
