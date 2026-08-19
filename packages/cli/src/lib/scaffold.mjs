// Scaffold templates for `motu init`. These exist so a fresh project gets a WORKING loop, not just
// a layout: `motu island verify` boots the lagoon root through Vite, so a project without one has
// static checks and no loop at all — which is the half of motu that matters.
//
// Templates are plain strings with {{placeholders}} (not JS template literals) so the generated TS —
// which is full of backticks and ${} of its own — passes through untouched.

/** Substitute {{key}} placeholders. An unknown placeholder is left alone (so it shows up in review). */
export function render(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// ---------------------------------------------------------------------------------------------
// Project root files (the layout declaration + the registries islands slot into)
// ---------------------------------------------------------------------------------------------

export const ISLANDS_REGISTRY = `// The project's element registry, assembled from each island's own element.ts. \`motu island create\`
// adds one import + one row here; the framework turns this into custom-element registrations.
import type { ElementSpec } from '@motu/react';

export const ELEMENT_REGISTRY: ElementSpec[] = [];
`;

export const ARCHIPELAGOS_REGISTRY = `// Registry of the project's archipelagos by id, so a composition root (or the lagoon / CLI) can
// resolve one by name. \`motu archipelago create\` adds one import + one row here.
import type { ArchipelagoConfig } from '@motu/core';

export const ARCHIPELAGOS: Record<string, ArchipelagoConfig> = {};

/** Resolve an archipelago config by id (undefined if unknown). */
export function getArchipelago(id: string): ArchipelagoConfig | undefined {
  return ARCHIPELAGOS[id];
}
`;

export const BARREL = `// Public surface of the project: the element registry and the archipelago configs + resolver.
// Composition roots (and the motu lagoon / CLI harness) import everything they need from here.
export { ELEMENT_REGISTRY } from './islands/registry.js';
export { ARCHIPELAGOS, getArchipelago } from './archipelagos/registry.js';
`;

/** The app package manifest — the lagoon imports the project by NAME, so the name must resolve. */
export const APP_PACKAGE_JSON = `{
  "name": "{{appPackage}}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles.css": "./src/shared/styles.css"
  },
  "dependencies": {
    "@motu/core": "{{motuDep}}",
    "@motu/react": "{{motuDep}}",
    "@motu/runtime": "{{motuDep}}"{{adapterDep}}
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
`;

/** The one shared island stylesheet. `motu archipelago verify` lints this, so it ships dual-mode. */
export const SHARED_STYLES = `/* Styles for every motu island. In shadow isolation this sheet is adopted into the shadow root; in
   light isolation it is injected once globally and the island root carries a \`.motu-root\` marker.
   That is why every host-scoped rule targets \`:where(:host, .motu-root)\` — a bare \`:host\` is inert
   in light DOM. One sheet, both modes.

   Colours come from --x-* tokens (host-overridable) with --_* locals holding the fallback, so a host
   can reskin islands without either side reopening isolation. */
:where(:host, .motu-root) {
  --_text: var(--x-color-text, inherit);
  --_muted: var(--x-color-muted, #6b7280);
  --_border: var(--x-border, #e5e7eb);
  --_radius: var(--x-radius, 6px);
  --_surface: var(--x-color-surface, #ffffff);
  display: block;
  color: var(--_text);
  font-family: var(--x-font, inherit);
}
`;

/** Build output + local installs. `.motu/` holds published lagoon artifacts, which are rebuilt on
 *  demand and can be large; the lagoon's node_modules is its own build toolchain. */
export const GITIGNORE = `node_modules/
dist/
.motu/
`;

// ---------------------------------------------------------------------------------------------
// Lagoon root — the part `motu island verify` actually boots
// ---------------------------------------------------------------------------------------------

/** The lagoon's OWN dependencies only.
 *
 *  Deliberately does not list @motu/* or the app package: vite.config resolves those by path (they
 *  are unpublished, raw-TS sources), so declaring them here would just be an install that fails.
 *  React is also absent on purpose — it resolves upward to the host application's copy, and a second
 *  React installed here would give the host two of them and break hooks the moment an island renders
 *  a component from the host's own library. */
export const LAGOON_PACKAGE_JSON = `{
  "name": "{{appPackage}}-lagoon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "focus": "vite --open /lagoon.html",
    "build": "vite build"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^5.4.10"{{lagoonExtraDevDeps}}
  }
}
`;

export const LAGOON_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>motu lagoon — {{appPackage}}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f6f4f0;
        color: #22302c;
        font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="lagoon-root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

export const LAGOON_FOCUS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>motu lagoon — single target (isolated)</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f6f4f0;
        color: #22302c;
        font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
      }
      #lagoon { max-width: 1440px; margin: 22px auto; padding: 0 20px; }
    </style>
  </head>
  <body>
    <div id="lagoon"></div>
    <script type="module" src="/src/lagoon.tsx"></script>
  </body>
</html>
`;

/** Fixture aggregation by glob, so adding an island needs no edit here (the demo app's hand-maintained
 *  fixtures.ts drifts by construction — its own header admits the manual step). */
export const LAGOON_FIXTURES = `// Every island's lagoon fixtures, gathered by glob so adding an island is not also an edit here.
// A \`fixtures.mock.ts\` that exports \`fixtures\` / \`roles\` is picked up automatically.
import type { Fixture } from '@motu/runtime/mock';

type FixtureModule = { fixtures?: Fixture[]; roles?: string[] };

const modules = import.meta.glob<FixtureModule>('{{fixturesGlob}}', { eager: true });

export const ALL_FIXTURES: Fixture[] = Object.values(modules).flatMap((m) => m.fixtures ?? []);

export const ALL_ROLES: string[] = [...new Set(Object.values(modules).flatMap((m) => m.roles ?? []))];
`;

/** The focused entry — this is what `motu island verify` drives via MOTU_TARGET. */
export const LAGOON_FOCUS_ENTRY = `// Thin lagoon entry: reads the vite-injected target/fit and hands the generic lagoon harness
// (@motu/react -> bootstrapLagoon) the project's element registry, fixtures and archipelago resolver.
// All harness logic is framework-side; this file only supplies app-specific inputs.
import { bootstrapLagoon } from '@motu/react';
import { setDefaultIsolation } from '@motu/core';
import { ELEMENT_REGISTRY, ARCHIPELAGOS, getArchipelago } from '{{appPackage}}';
import css from '{{appPackage}}/styles.css?inline';
import { ALL_FIXTURES, ALL_ROLES } from './fixtures.js';
{{hostImport}}
// Injected by vite.config from the MOTU_* env (see vite.config.ts).
declare const __MOTU_TARGET__: string; // "island:{{tagPrefix}}some-tag" | "archipelago:some-id"
declare const __MOTU_FIT__: string; //    "native" | "legacy"
declare const __MOTU_FORCE_ERROR__: string; // "" | "500" | "403" — verify's error-resilience mount
declare const __MOTU_ISOLATION__: 'shadow' | 'light';

// Set BEFORE bootstrapLagoon so single-target verify exercises the project's real isolation posture.
setDefaultIsolation(__MOTU_ISOLATION__);

// verify always passes an explicit MOTU_TARGET. Opening lagoon.html by hand does not, so fall back
// to the project's first archipelago rather than to a name the framework guessed.
const target =
  (typeof __MOTU_TARGET__ === 'string' && __MOTU_TARGET__) ||
  (Object.keys(ARCHIPELAGOS)[0] ? 'archipelago:' + Object.keys(ARCHIPELAGOS)[0] : '');

bootstrapLagoon({
  elements: ELEMENT_REGISTRY,
  css,
  fixtures: ALL_FIXTURES,
  roles: ALL_ROLES,
  resolveArchipelago: getArchipelago,
{{hostOption}}  target,
  fit: typeof __MOTU_FIT__ === 'string' ? __MOTU_FIT__ : '',
  forceErrorStatus:
    typeof __MOTU_FORCE_ERROR__ === 'string' && __MOTU_FORCE_ERROR__ ? Number(__MOTU_FORCE_ERROR__) : undefined,
});
`;

/** The gallery entry — every archipelago with a switcher. The human-facing half of the lagoon. */
export const LAGOON_GALLERY_ENTRY = `// The lagoon gallery: every archipelago in the project, with a switcher. This is the design/play
// surface; the single-target lagoon.tsx next to it is what \`motu island verify\` drives.
import { configure } from '@motu/runtime';
import { MockTransport } from '@motu/runtime/mock';
import { setDefaultIsolation } from '@motu/core';
import { defineLagoon, resolveTransportMode, mountTransportToggle } from '@motu/react';
import { ELEMENT_REGISTRY, ARCHIPELAGOS, getArchipelago } from '{{appPackage}}';
import css from '{{appPackage}}/styles.css?inline';
import { ALL_FIXTURES, ALL_ROLES } from './fixtures.js';
{{hostImport}}
declare const __MOTU_ISOLATION__: 'shadow' | 'light';
declare const __MOTU_TRANSPORT__: string;

setDefaultIsolation(__MOTU_ISOLATION__);

// Mock by default: the lagoon must work with no backend, no session and no login, or it is not a
// place an agent can close a loop in.
configure(new MockTransport(ALL_FIXTURES, ALL_ROLES));

const root = document.getElementById('lagoon-root')!;
const ids = Object.keys(ARCHIPELAGOS);

function show(id: string) {
  host.innerHTML = '';
  const config = getArchipelago(id);
  if (!config) return;
  host.appendChild(
    defineLagoon({ kind: 'archipelago', config }, { elements: ELEMENT_REGISTRY, css{{hostOptionInline}} }),
  );
  for (const b of bar.querySelectorAll('button')) {
    b.setAttribute('aria-current', String(b.dataset.id === id));
  }
}

const bar = document.createElement('nav');
bar.style.cssText = 'display:flex;gap:8px;padding:12px 20px;flex-wrap:wrap;align-items:center';
const host = document.createElement('div');
host.style.cssText = 'max-width:1440px;margin:0 auto;padding:0 20px';

if (ids.length === 0) {
  host.innerHTML =
    '<p style="color:#6b7280;padding:40px 0">No archipelagos yet — run <code>motu archipelago create &lt;id&gt;</code>, ' +
    'then <code>motu island create &lt;name&gt;</code>.</p>';
} else {
  for (const id of ids) {
    const b = document.createElement('button');
    b.textContent = id;
    b.dataset.id = id;
    b.style.cssText = 'padding:6px 12px;border:1px solid #d3cede;border-radius:6px;background:#fff;cursor:pointer';
    b.onclick = () => show(id);
    bar.appendChild(b);
  }
}

root.append(bar, host);
if (ids.length) show(ids[0]);

// The transport pill (mock <-> http) — only meaningful once the project has a real backend seam.
mountTransportToggle(resolveTransportMode(__MOTU_TRANSPORT__));
`;

// ---------------------------------------------------------------------------------------------
// Vite config — the lagoon's real contract with the CLI (these defines ARE the verify protocol)
// ---------------------------------------------------------------------------------------------

export const LAGOON_VITE_CONFIG = `import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
{{viteHostImports}}
// The project's motu.config.json — the single declaration this lagoon reads its posture and its
// framework location from, so neither is duplicated into generated code.
const CONFIG_PATH = resolve(__dirname, '{{configFromLagoon}}');
const CONFIG = (() => {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
})();

// Project-wide default island isolation, so the lagoon previews the same posture as production.
const ISOLATION = CONFIG.isolation === 'light' ? 'light' : 'shadow';

// Where the motu framework checkout lives. @motu/* are unpublished workspace packages whose entry
// point is raw TypeScript, so the lagoon resolves them by path rather than through node_modules —
// which is what lets this project use motu with no install step. MOTU_ROOT overrides for CI or a
// teammate whose checkout sits elsewhere; motu.config.json's \`motuRoot\` is the committed default.
const MOTU_ROOT = process.env.MOTU_ROOT
  ? resolve(process.env.MOTU_ROOT)
  : resolve(dirname(CONFIG_PATH), CONFIG.motuRoot ?? '.');

const motu = (p) => resolve(MOTU_ROOT, p);

// One-chunk build target for \`motu lagoon publish\`: 'lagoon' (focused) | 'main' (the gallery).
// Unset => the normal two-entry, code-split build.
const SINGLE_FILE =
  process.env.MOTU_SINGLEFILE === 'lagoon' ? 'lagoon' : process.env.MOTU_SINGLEFILE === 'main' ? 'main' : '';

export default defineConfig({
  plugins: [react()],
  // These defines are the contract with \`motu island verify\`, which sets the matching MOTU_* env
  // when it boots this server. Dropping one silently weakens verification — keep them in sync.
  define: {
    __MOTU_TRANSPORT__: JSON.stringify(process.env.MOTU_TRANSPORT ?? ''),
    __MOTU_TARGET__: JSON.stringify(process.env.MOTU_TARGET ?? ''),
    __MOTU_FIT__: JSON.stringify(process.env.MOTU_FIT ?? ''),
    __MOTU_FORCE_ERROR__: JSON.stringify(process.env.MOTU_FORCE_ERROR ?? ''),
    __MOTU_DEBUG__: JSON.stringify(process.env.MOTU_DEBUG !== '0'),
    __MOTU_ISOLATION__: JSON.stringify(ISOLATION),
  },
  resolve: {
    // One React, always. The lagoon has no React of its own so it resolves the host application's,
    // and dedupe keeps it that way through the aliased sources — two copies would break hooks in any
    // island that renders a component from the host's library.
    dedupe: ['react', 'react-dom'],
    // Array form with anchored patterns, not the object form. Vite's alias matcher is
    // exact-or-prefix-with-a-slash, which gets two things wrong here: 'pkg/styles.css?inline' never
    // matches 'pkg/styles.css' (the query is part of the id), and '@motu/runtime' happily swallows
    // '@motu/runtime/mock'. Anchored regexes make each mapping mean exactly what it says.
    alias: [
{{motuAliases}}{{hostAliases}}    ],
  },
{{viteCss}}  build: {
    // MOTU_SINGLEFILE=lagoon|main builds ONE entry as ONE chunk so \`motu lagoon publish\` can inline
    // the whole app into a single HTML file — nothing serves /assets/* behind a static artifact.
    ...(SINGLE_FILE ? { cssCodeSplit: false, assetsInlineLimit: 100_000_000 } : {}),
    rollupOptions: {
      input: SINGLE_FILE
        ? { [SINGLE_FILE]: resolve(__dirname, SINGLE_FILE === 'lagoon' ? 'lagoon.html' : 'index.html') }
        : { main: resolve(__dirname, 'index.html'), lagoon: resolve(__dirname, 'lagoon.html') },
      ...(SINGLE_FILE ? { output: { inlineDynamicImports: true } } : {}),
    },
  },
  server: { port: 5173, strictPort: false },
});
`;

// --- host: next -------------------------------------------------------------------------------

/** Next's own modules have no meaning in a plain Vite SPA — the lagoon stubs them so a client
 *  component that links or routes still mounts. Kept deliberately small: anything an island needs
 *  beyond this is a sign it is reaching for the host instead of emitting an intent. */
export const NEXT_STUBS = `// Vite aliases point next/* here: the lagoon is a plain SPA with no Next runtime, but an island is
// still allowed to render a link or read the router. Navigation intents belong to the host bridge
// (@motu/adapter-next), so these stubs are inert on purpose — they render and no-op, they never
// navigate. If an island needs more of Next than this, it is coupling to the host too tightly.
import { createElement, forwardRef, type ComponentProps } from 'react';

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<'a'> & { href?: unknown }>(
  function Link({ href, children, ...rest }, ref) {
    return createElement('a', { ...rest, ref, href: typeof href === 'string' ? href : '#' }, children);
  },
);

export const Image = forwardRef<HTMLImageElement, ComponentProps<'img'>>(function Image(props, ref) {
  return createElement('img', { ...props, ref });
});

const noop = () => {};

export function useRouter() {
  return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop };
}

export function usePathname() {
  return '/';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useParams() {
  return {} as Record<string, string>;
}

export default Link;
`;

export const NEXT_VITE_IMPORTS = `import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
`;

/** Alias fragment for a Next host: the app's own '@/…' alias plus inert next/* stubs, so the lagoon
 *  can mount components written against the host's conventions. */
export const NEXT_VITE_ALIASES = `      // The lagoon mounts components written for the Next app, so it speaks the same module language:
      // the host's '@/…' alias, and next/* mapped to inert stubs (see src/next-stubs.tsx).
      { find: /^@\\//, replacement: resolve(__dirname, '{{hostRootFromLagoon}}') + '/' },
      { find: /^next\\/link$/, replacement: resolve(__dirname, 'src/next-stubs.tsx') },
      { find: /^next\\/image$/, replacement: resolve(__dirname, 'src/next-stubs.tsx') },
      { find: /^next\\/navigation$/, replacement: resolve(__dirname, 'src/next-stubs.tsx') },
`;

/** Tailwind is the HOST's, not motu's: point postcss at the host config so an island's utility
 *  classes render in the lagoon exactly as they do in the app. */
export const NEXT_VITE_CSS = `  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: resolve(__dirname, '{{hostRootFromLagoon}}/tailwind.config.ts') }),
        autoprefixer(),
      ],
    },
  },
`;
