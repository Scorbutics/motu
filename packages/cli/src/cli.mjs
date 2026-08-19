#!/usr/bin/env node
// motu — the agentic CLI for the island / archipelago workflow.
//
//   motu island create <name>    scaffold a new island (component + registry row + fixtures)
//   motu island verify <name>    run the deterministic island rules + lagoon mount (the moat)
//
// Kept dependency-light and plain-ESM (like @motu/codegen) so it runs with a bare `node`.
import { createCommand } from './commands/create.mjs';
import { verifyCommand, archipelagoVerifyCommand } from './commands/verify.mjs';
import { integrateCommand } from './commands/integrate.mjs';
import { archipelagoCreateCommand } from './commands/archipelago.mjs';
import { archipelagoRecordFrameCommand } from './commands/record-frame.mjs';
import { codegenCommand } from './commands/codegen.mjs';
import { fixturesRecordCommand } from './commands/fixtures.mjs';
import { lagoonPublishCommand, lagoonServeCommand } from './commands/lagoon.mjs';
import { initCommand } from './commands/init.mjs';
import { skillsInstallCommand, skillsListCommand } from './commands/skills.mjs';
import { color } from './lib/util.mjs';

/** Minimal argv parser: positionals in `_`, `--flag`/`--no-flag`/`--key value` in the rest. */
function parse(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--no-')) out[a.slice(5)] = false;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const USAGE = `${color.bold('motu')} — island / archipelago CLI

${color.bold('Usage:')}
  motu init [dir]                                   scaffold motu.config.json + empty roots/registries
  motu island create <name>                         scaffold a new island (component, registry, fixtures)
  motu island verify <name>                         run the island rules + lagoon mount (the loop)
  motu island integrate <name> --archipelago <id>   make the island a member of an archipelago
  motu archipelago create <id>                      scaffold + register a new archipelago
  motu archipelago verify <id>                      boot the whole region in the lagoon + config checks
  motu archipelago record-frame <id> --url <u>      capture per-mountpoint frames from the live ocean
  motu fixtures record <island>                     capture backend responses into request-keyed fixtures
  motu lagoon publish [island]                      build the lagoon as one self-contained page to publish
  motu lagoon serve [island]                        build that same page and serve it (preview it in a browser)
  motu lagoon serve --watch --host                  ...and keep it current: rebuild on save, reload viewers
  motu codegen [manifest] [outDir]                  regenerate @motu/contract from motu-manifest.json
  motu skills install [dir]                         install the motu agent skills into a repo (Copilot + Claude Code)
  motu skills list                                  list the skills this motu checkout ships

${color.bold('verify flags:')}
  --fast          use the in-process happy-dom lagoon mount instead of the real browser (Playwright)
  --no-runtime    skip the lagoon mount entirely (static + config checks only)
  --standalone    the island is intentionally not in an archipelago (no membership warning)
  --json          machine-readable report

${color.bold('lagoon serve flags:')}
  --port <n>      port to listen on (default 8817)
  --host          also serve on your LAN, to open it on a phone on the same wifi
  --no-build      serve the last published artifact instead of rebuilding
  --watch         rebuild on every source change and live-reload open viewers (phones included)
  ${color.dim('takes the same target/--fit flags as publish. Ctrl-C to stop.')}

${color.bold('lagoon publish flags:')}
  --archipelago <id>   publish one archipelago instead of an island
  --fit <native|legacy>  legacy-fit strategy for a single-island target
  --out <path>         write somewhere other than .motu/publish/ (keep it stable to keep one URL)
  --json          machine-readable report
  ${color.dim('no target => every archipelago, with the switcher. Always mock-backed: an artifact has no backend.')}

${color.bold('integrate flags:')}
  --archipelago <id>   (required) target archipelago id
  --slot <slot>        marker slot name (defaults to the island's kebab name)

${color.bold('skills install flags:')}
  --only <both|claude|copilot>   which agent format(s) to write (default: both)
  --force         overwrite files that already exist with different contents
  --json          machine-readable report

${color.bold('create flags:')}
  --force         overwrite existing files
`;

async function main() {
  const [, , group, sub, ...rest] = process.argv;
  const argv = parse(rest);

  if (!group || group === '--help' || group === '-h' || group === 'help') {
    console.log(USAGE);
    process.exit(group ? 0 : 1);
  }

  if (group === 'init') {
    // Top-level verb: sub is an optional target dir positional.
    return initCommand(parse([sub, ...rest].filter((x) => x !== undefined)));
  }

  if (group === 'island') {
    if (sub === 'create') return createCommand(argv);
    if (sub === 'verify') return verifyCommand(argv);
    if (sub === 'integrate') return integrateCommand(argv);
    console.error(color.red(`unknown: motu island ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'archipelago') {
    if (sub === 'create') return archipelagoCreateCommand(argv);
    if (sub === 'verify') return archipelagoVerifyCommand(argv);
    if (sub === 'record-frame') return archipelagoRecordFrameCommand(argv);
    console.error(color.red(`unknown: motu archipelago ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'fixtures') {
    if (sub === 'record') return fixturesRecordCommand(argv);
    console.error(color.red(`unknown: motu fixtures ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'skills') {
    // `install` takes an optional target-dir positional, so re-parse with `rest` shifted.
    if (sub === 'install') return skillsInstallCommand(parse(rest));
    if (sub === 'list') return skillsListCommand(argv);
    console.error(color.red(`unknown: motu skills ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'lagoon') {
    if (sub === 'publish') return lagoonPublishCommand(argv);
    if (sub === 'serve') return lagoonServeCommand(argv);
    console.error(color.red(`unknown: motu lagoon ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'codegen') {
    // Top-level verb: sub + rest are positional args ([manifest, outDir]).
    return codegenCommand(parse([sub, ...rest].filter((x) => x !== undefined)));
  }

  console.error(color.red(`unknown command: motu ${group}`));
  console.log(USAGE);
  process.exit(2);
}

main().catch((err) => {
  console.error(color.red(err?.stack || String(err)));
  process.exit(1);
});
