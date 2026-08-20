#!/usr/bin/env node
// The lagoon build, run as its own process.
//
// `motu lagoon publish|serve` shells out to this rather than building in-process, for the same reason
// it used to shell out to the vite CLI: the build runs inside sync watcher and request callbacks, and
// a subprocess keeps those call sites unchanged. What changed is WHAT is run — the config now comes
// from @motu/cli (see lib/lagoon-vite.mjs) instead of a vite.config.ts scaffolded into the project.
//
// Invoked with the project as cwd; every MOTU_* input arrives through the environment, exactly as the
// vite CLI received it.
import { resolve } from 'node:path';
import { loadMotuConfig } from './lib/config.mjs';
import { buildLagoonViteConfig, resolveVite } from './lib/lagoon-vite.mjs';

const paths = loadMotuConfig();
const vite = await resolveVite(paths);
const config = await buildLagoonViteConfig(paths, process.env);
// Vite resolves `outDir` against ROOT, and root is now `.motu/cache/lagoon` for a project that does
// not own its entries — so the artifact would land in the cache while `publish`/`serve` look for it
// under the project's lagoon. Pin it back with an absolute path: where the build INPUT lives is a
// framework detail, where the OUTPUT lands is the project's.
config.build.outDir = resolve(paths.lagoonDir, 'dist');
config.build.emptyOutDir = true;
config.logLevel = process.env.MOTU_VITE_LOGLEVEL ?? 'warn';
await vite.build(config);
