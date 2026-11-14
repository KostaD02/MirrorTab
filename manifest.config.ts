import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  // ? __MSG_ keys resolve from _locales/<locale>/messages.json, see https://developer.chrome.com/docs/extensions/reference/api/i18n
  name: '__MSG_appName__',
  version: pkg.version,
  description: '__MSG_appDescription__',
  default_locale: 'en',
  icons: {
    48: 'public/logo.png',
  },
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
    default_title: '__MSG_appName__',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/main.ts'],
      matches: ['https://*/*', 'http://*/*'],
      run_at: 'document_idle',
      all_frames: true,
      match_origin_as_fallback: true,
    },
  ],
  permissions: ['storage'],
});
