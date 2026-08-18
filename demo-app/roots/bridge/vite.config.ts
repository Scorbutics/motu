import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// MOTU_CONSOLE_DEVDIST lets the bridge bundle be emitted into the legacy console devserver's
// live-reloaded dist dir (see `watch:console` script) for hot reload during development. When unset,
// it builds normally into ./dist for the jar/embed.
const consoleDist = process.env.MOTU_CONSOLE_DEVDIST;

// The project-wide default island/region isolation, read from the repo's motu.config.json so the
// runtime honours the same source of truth as the CLI. Falls back to 'shadow' (the safe framework
// default) if unset or unreadable.
function motuIsolation() {
  try {
    const cfg = JSON.parse(readFileSync(fileURLToPath(new URL('../../../motu.config.json', import.meta.url)), 'utf8'));
    return cfg.isolation === 'light' ? 'light' : 'shadow';
  } catch {
    return 'shadow';
  }
}

// Library mode -> a single self-contained IIFE bridge.js with React bundled in. This is the only
// artifact the legacy app loads; it must not assume any globals beyond the browser + (optional)
// AngularJS already on the page.
export default defineConfig({
  // React and react-dom reference process.env.NODE_ENV. In library/IIFE mode Vite does NOT
  // substitute these, leaving a bare `process` that throws "process is not defined" in the browser
  // before the element registers. Substitute at build time so the bundle is self-contained.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
    // The debug overlay + all its framework instrumentation gate on this. Off for the prod bridge
    // (dead-code-eliminated), on for the console hot-reload build (watch:console sets MOTU_DEBUG=1).
    __MOTU_DEBUG__: JSON.stringify(process.env.MOTU_DEBUG === '1'),
    // Project-wide default isolation, injected from motu.config.json (see setDefaultIsolation).
    __MOTU_ISOLATION__: JSON.stringify(motuIsolation()),
  },
  build: {
    // Keep native class private fields/methods (#x). Down-levelling them makes esbuild emit helper
    // functions (minified to names like `$`) at the top of the IIFE-less output, where they leak to
    // the global scope and clobber the legacy page's jQuery `$`. es2022 supports them natively.
    target: 'es2022',
    lib: {
      entry: 'src/main.ts',
      name: 'MotuBridge',
      formats: ['iife'],
      fileName: () => 'bridge.js',
    },
    outDir: consoleDist ?? 'dist',
    // Never wipe the console devserver dist (it holds console.js etc.).
    emptyOutDir: !consoleDist,
    cssCodeSplit: false,
  },
});
