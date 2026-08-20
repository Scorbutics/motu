#!/usr/bin/env node
// The lagoon dev server, run as its own process.
//
// Two callers: `motu lagoon dev` (a human iterating) and `motu island|archipelago verify`, which boots
// a FOCUSED server (MOTU_TARGET) in its own process group so it can be killed cleanly and cannot
// outlive the run holding a strict port. Both used to spawn the vite CLI against a vite.config.ts
// scaffolded into the project; the config now comes from @motu/cli instead.
//
// Invoked with the project as cwd. Flags mirror the vite CLI's, because verify's process handling
// depends on them: --port, --strictPort.
import { loadMotuConfig } from './lib/config.mjs';
import { buildLagoonViteConfig, resolveVite } from './lib/lagoon-vite.mjs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1]?.startsWith('--') ? true : (argv[i + 1] ?? true)) : undefined;
};

const paths = loadMotuConfig();
const vite = await resolveVite(paths);
const config = await buildLagoonViteConfig(paths, process.env);

const port = flag('port');
if (port) config.server.port = Number(port);
if (flag('strictPort')) config.server.strictPort = true;
config.clearScreen = false;
config.logLevel = process.env.MOTU_VITE_LOGLEVEL ?? 'info';

const server = await vite.createServer(config);
await server.listen();
server.printUrls();
