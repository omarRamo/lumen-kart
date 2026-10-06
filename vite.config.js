import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Three.js r170 ships its whole core as ONE ES module (build/three.module.js). Rolldown splits
// chunks at module granularity, so the tree-shaken core (~520 kB min, ~135 kB gzip) cannot be cut
// further. It is bundled inside the app (never downloaded on native), so the 500 kB advisory is
// raised just above that single vendor chunk; any app chunk growing past it still warns.
const THREE_CORE_LIMIT_KB = 600;

export default defineConfig({
  // Relative URLs: the same dist/ runs from capacitor://localhost, https://localhost, a sub-path or file preview.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    // Capacitor 8: iOS 15+ WKWebView, Android System WebView ≥ 90 (capacitor.config.json minWebViewVersion).
    target: ['es2022', 'safari15', 'chrome90'],
    chunkSizeWarningLimit: THREE_CORE_LIMIT_KB,
    reportCompressedSize: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]build[\\/]/, priority: 30 },
            { name: 'three-addons', test: /[\\/]node_modules[\\/]three[\\/]examples[\\/]/, priority: 20 },
            { name: 'capacitor', test: /[\\/]node_modules[\\/]@capacitor[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
