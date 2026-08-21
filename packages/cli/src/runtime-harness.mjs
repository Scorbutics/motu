// Runtime lagoon check, run in-process under happy-dom (no browser download, no vite). It mounts ONE
// island by tag against MockTransport fixtures and reports whether it produced a non-empty shadow DOM.
// Run via `node --import tsx runtime-harness.mjs <tag> <fixturesPath> <fit> [mode]`; prints a single
// JSON line. mode 'mount' (default) = the render/remount check; mode 'differentiate' = mount once per
// declared `scenario` seed and report whether distinct inputs produced distinct output (data-flow).
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import * as React from 'react';

async function main() {
  const [, , tag, fixturesPath, fit = 'native', mode = 'mount'] = process.argv;

  // 'scenarios' mode: print the fixtures' declared scenarios as JSON and exit BEFORE importing the DOM
  // or the element registry (which may pull in vite-only `?raw` imports). Lets the plain-node verify
  // CLI read scenarios without a happy-dom mount.
  if (mode === 'scenarios') {
    let scenarios = [];
    if (fixturesPath) {
      try {
        const mod = await import(fixturesPath);
        scenarios = mod.scenarios ?? [];
      } catch (err) {
        process.stderr.write(`harness: could not load scenarios ${fixturesPath}: ${err?.message}\n`);
      }
    }
    process.stdout.write(JSON.stringify({ scenarios }) + '\n');
    process.exit(0);
  }

  // 'catalogue' mode: resolve a catalogue region's declared members against the app's own capture.
  // Runs here rather than in the CLI for one reason: `@motu/core` is TS source, so `checkCatalogue`
  // is importable under tsx and nowhere else — and a second copy of that set arithmetic in the CLI
  // would drift from the one the framework actually ships.
  if (mode === 'catalogue') {
    const declared = JSON.parse(process.env.MOTU_CATALOGUE_DECLARED ?? '[]');
    try {
      const { capture } = await import(fixturesPath);
      if (!capture) {
        process.stdout.write(JSON.stringify({ error: 'no `capture` export' }) + '\n');
        process.exit(0);
      }
      const { checkCatalogue } = await import('@motu/core');
      const present = (typeof capture.present === 'function' ? capture.present() : capture.present) ?? [];
      const universe = typeof capture.universe === 'function' ? capture.universe() : capture.universe;
      process.stdout.write(JSON.stringify({ report: checkCatalogue({ declared, universe, present }), present: present.length }) + '\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({ error: err?.message ?? String(err) }) + '\n');
    }
    process.exit(0);
  }

  GlobalRegistrator.register();
  // The islands rely on the JSX transform and never `import React`. tsx/esbuild compiles the classic
  // runtime (React.createElement) here, so expose React as a free global for the island modules.
  globalThis.React = React;

  // Diagnostics: any console.error the island emits (incl. React warnings) or unhandled rejection.
  const diagnostics = [];
  const realConsoleError = console.error.bind(console);
  console.error = (...args) => {
    diagnostics.push('console.error: ' + args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  };
  process.on('unhandledRejection', (reason) => {
    diagnostics.push('unhandledrejection: ' + String(reason instanceof Error ? reason.stack || reason.message : reason));
  });

  // Imported AFTER the DOM globals exist so custom elements / shadow roots / constructable stylesheets
  // resolve against happy-dom.
  const { configure } = await import('@motu/runtime');
  const { MockTransport } = await import('@motu/runtime/mock');
  const { defineLagoon } = await import('@motu/react');
  // Import the app barrel by resolved path (from motu.config.json), not by a hardcoded package name,
  // so the harness works for any project layout.
  const { pathToFileURL } = await import('node:url');
  const { paths } = await import('./lib/util.mjs');
  const { ELEMENT_REGISTRY } = await import(pathToFileURL(paths.barrel).href);

  let fixtures = [];
  let roles = [];
  let scenarios = [];
  if (fixturesPath) {
    try {
      const mod = await import(fixturesPath);
      fixtures = mod.fixtures ?? [];
      roles = mod.roles ?? [];
      scenarios = mod.scenarios ?? [];
    } catch (err) {
      // Missing/broken fixtures shouldn't crash the mount; the default render doesn't need them.
      process.stderr.write(`harness: could not load fixtures ${fixturesPath}: ${err?.message}\n`);
    }
  }

  configure(new MockTransport(fixtures, roles));

  const mountOne = (seed = { criteria: {} }) => {
    const node = defineLagoon({ kind: 'island', tag, fit }, { elements: ELEMENT_REGISTRY, seed });
    document.body.appendChild(node);
    return node;
  };

  // The lagoon wraps every island target in a one-island <motu-archipelago> that owns the shadow
  // boundary; the island renders LIGHT inside it, so pierce the archipelago shadow to find the tag and
  // read its light DOM (a standalone island would instead have its own shadowRoot).
  const findIsland = () => {
    let node = document.querySelector(tag);
    if (!node) {
      for (const arch of document.querySelectorAll('motu-archipelago')) {
        const hit = arch.shadowRoot && arch.shadowRoot.querySelector(tag);
        if (hit) {
          node = hit;
          break;
        }
      }
    }
    return node;
  };
  const rendered = (node) => (node ? (node.shadowRoot ? node.shadowRoot.innerHTML : node.innerHTML) : '');

  // DIFFERENTIATION mode: mount once per declared scenario seed and diff the rendered output. Distinct
  // inputs producing distinct output prove data flows criteria -> contract -> render (not just wiring).
  if (mode === 'differentiate') {
    const result = { differentiates: null, scenarioCount: scenarios.length, diagnostics };
    if (scenarios.length >= 2) {
      const outputs = [];
      for (const scenario of scenarios) {
        document.body.innerHTML = '';
        mountOne(scenario.seed ?? {});
        await new Promise((r) => setTimeout(r, 80));
        outputs.push(rendered(findIsland()));
      }
      // All rendered something AND not every output is identical.
      result.differentiates = outputs.every((o) => o.trim().length > 0) && new Set(outputs).size > 1;
    }
    console.error = realConsoleError;
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(0);
  }

  const el = mountOne();

  // Let the custom-element upgrade + React render flush.
  await new Promise((r) => setTimeout(r, 60));

  const island = findIsland();
  const renderedHtml = rendered(island);
  const ok = Boolean(island) && renderedHtml.trim().length > 0;

  // Re-mount identical: dispose this element and mount a fresh one, diff the rendered output.
  let remountIdentical = null;
  if (ok) {
    document.body.removeChild(el); // disconnectedCallback -> __motuDispose
    mountOne();
    await new Promise((r) => setTimeout(r, 60));
    remountIdentical = rendered(findIsland()) === renderedHtml;
  }

  console.error = realConsoleError;

  process.stdout.write(
    JSON.stringify({
      ok,
      fit,
      mounted: Boolean(island),
      shadowLength: renderedHtml.length,
      diagnostics,
      remountIdentical,
    }) + '\n',
  );
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`harness-fatal: ${err?.stack || err}\n`);
  process.exit(3);
});
