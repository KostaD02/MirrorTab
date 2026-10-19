import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import { NodePackageImporter } from 'sass';
import { defineConfig } from 'vite';
import zip from 'vite-plugin-zip-pack';
import manifest from './manifest.config.js';
import { version } from './package.json';

export default defineConfig({
  css: {
    preprocessorOptions: {
      // ? lets overlay.scss pull single @kostad/brand partials with pkg: URLs
      scss: { importers: [new NodePackageImporter()] },
    },
  },
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`,
    },
  },
  plugins: [
    crx({ manifest }),
    zip({ outDir: 'release', outFileName: `MirrorTab-${version}.zip` }),
  ],
  build: {
    rollupOptions: {
      input: {
        replay: 'src/replay/index.html',
        pending: 'src/pending/index.html',
      },
    },
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
