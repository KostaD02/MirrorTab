import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  description:
    'Mirror any DOM interactions from a source tab to a target tab in real time.',
  icons: {
    48: 'public/logo.png',
  },
  action: {
    default_icon: {
      48: 'public/logo.png',
    },
    default_popup: 'src/popup/index.html',
    default_title: 'MirrorTab',
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
      all_frames: false,
    },
  ],
  permissions: ['tabs', 'scripting', 'storage'],
  host_permissions: ['https://*/*', 'http://*/*'],
});
