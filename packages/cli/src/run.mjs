#!/usr/bin/env node
// motu — the agentic CLI for the island / archipelago workflow.
//
//   motu island create <name>    scaffold a new island (component + registry row + fixtures)
//   motu island verify <name>    run the deterministic island rules + lagoon mount (the moat)
//                                `--all` sweeps every island; one line each, findings only where there are any
//
// Kept dependency-light and plain-ESM (like @motu/codegen) so it runs with a bare `node`.
import { createCommand } from './commands/create.mjs';
import { verifyCommand, archipelagoVerifyCommand } from './commands/verify.mjs';
import { checkCommand } from './commands/check.mjs';
import { snapshotCommand, archipelagoSnapshotCommand } from './commands/snapshot.mjs';
import { integrateCommand } from './commands/integrate.mjs';
import { integrateCheckCommand } from './commands/integration.mjs';
import { regionInitCommand } from './commands/region.mjs';
import { regionCoverageCommand } from './commands/region-coverage.mjs';
import { archipelagoCreateCommand } from './commands/archipelago.mjs';
import { archipelagoRecordFrameCommand } from './commands/record-frame.mjs';
import { codegenCommand } from './commands/codegen.mjs';
import { fixturesRecordCommand } from './commands/fixtures.mjs';
import { islandDefaultsCommand, islandSyncCommand } from './commands/defaults.mjs';
import { removalCheckCommand } from './commands/removal-check.mjs';
import { contractCheckCommand } from './commands/contract.mjs';
import { lagoonPublishCommand, lagoonServeCommand, lagoonDevCommand, lagoonEjectCommand } from './commands/lagoon.mjs';
import { lagoonGroupCommand, lagoonGroupsCommand } from './commands/lagoon-group.mjs';
import { initCommand } from './commands/init.mjs';
import { skillsInstallCommand, skillsListCommand } from './commands/skills.mjs';
import { color, ensureNoInstallLinks, REPO_ROOT, MOTU_CHECKOUT } from './lib/util.mjs';

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
  motu init [dir] --host next|angularjs|none        scaffold config + registries + a WORKING lagoon root
  motu island create <name>                         scaffold a new island (component, registry, fixtures)
  motu island create <name> --from <specifier>      ...over a component the app ALREADY owns (React hosts)
  motu check                                        every island + every region + removal, one verdict
  motu island verify <name|--all>                   the island rules (static; --runtime adds the browser)
  motu island snapshot <name|--all> [--update]      visual baselines, per scenario × viewport
  motu island snapshot --all --remote               ...stored on the lagoon host instead of in git
  motu island snapshot --all --remote --changed     ...only what this branch touched
  motu island snapshot --accept <name>              move the accepted baseline — a decision, not a write
  motu island defaults [name]                       classify declared defaults: component default, or evidence?
  motu island sync                                  regenerate the element registry from the files on disk
  motu island integrate <name> --archipelago <id>   make the island a member of an archipelago
  motu region init <id> --page <file>              scaffold everything a page needs before its 1st island
  motu region coverage <id> [--corpus <f>]         states production reached that no flow previews
  motu integrate check [region]                    does the HOST compose, place and read the region?
  motu archipelago create <id>                      scaffold + register a new archipelago
  motu archipelago verify <id|--all>                boot the whole region in the lagoon + config checks
  motu archipelago snapshot <id|--all> --remote      picture the COMPOSED page — catches arrangement
  motu archipelago record-frame <id> --url <u>      capture per-mountpoint frames from the live ocean
  motu fixtures record <island>                     capture backend responses into request-keyed fixtures
  motu lagoon dev [island]                          serve the lagoon with HMR (the iteration loop)
  motu lagoon eject                                 write the framework's lagoon entries into the project
  motu lagoon publish [island]                      build the lagoon as one self-contained page to publish
  motu lagoon publish --remote <url>                ...and upload it to a lagoon host (see motu-host)
  motu lagoon serve [island]                        build that same page and serve it (preview it in a browser)
  motu lagoon serve --watch --host                  ...and keep it current: rebuild on save, reload viewers
  motu lagoon group <name> --all                    compose every published project into one gallery
  motu lagoon groups                                the galleries this host serves
  motu contract check [--update]                    the app's boundary + coupling graph, as one artifact
  motu removal-check [--force]                      prove motu is removable from the host app (C2)
  motu codegen [manifest] [outDir]                  regenerate @motu/contract from motu-manifest.json
  motu skills install [dir]                         install the motu agent skills into a repo (Copilot + Claude Code)
  motu skills list                                  list the skills this motu checkout ships

${color.bold('snapshot flags:')}
  --update        record the baselines instead of checking them (a deliberate, separate act)
  --all           every island
  --json          machine-readable report
  ${color.dim('baselines live in <islands>/<kebab>.snapshots/, one per scenario × viewport; commit them.')}

${color.bold('removal-check flags:')}
  --force         re-prove it even when nothing it depends on has changed
  ${color.dim('the proof is cached against the files it touches + the islands/archipelagos it generates from;')}
  ${color.dim('an unchanged repo skips the application typecheck, which is nearly all of the cost.')}

${color.bold('check flags:')}
  --runtime       also drive the lagoon in a browser (mount, data-flow, viewports, axe, live wiring)
  --verbose       name each runtime step as it runs, with what it cost
  --json          machine-readable verdict: islands, regions, removal
  ${color.dim('motu check runs MOTU\'s gates only. Your typecheck/linter are yours: `<host build> && motu check`.')}

${color.bold('verify flags:')}
  --all           every island / every region, one after another; one line each, findings where there are any
  --runtime       add the lagoon checks: mount, data-flow, viewports, axe, live wiring
                  ${color.dim('opt-in: it drives a real browser per scenario × viewport. Static verify answers drift, which is the common question.')}
  --verbose       name each runtime step as it runs, with what it cost
  --fast          use the in-process happy-dom lagoon mount instead of the real browser (Playwright)
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
  --title <text>       name this lagoon in the host's listing (default: derived from the target)
  --remote [url]       also upload it to a lagoon host (or $MOTU_HOST_URL) and print the URLs
  --token <secret>     the host's upload token (or $MOTU_HOST_TOKEN)
  --json          machine-readable report
  ${color.dim('no target => every archipelago, with the switcher. Always mock-backed: an artifact has no backend.')}

${color.bold('island create flags:')}
  --from <specifier>   wrap a component the application already owns instead of scaffolding one under
                       ui/ — the React-host case, where copying it would fork it. Use the specifier
                       the app itself uses (an alias like @/components/foo, or a relative path).
  --export <name>      the component's name INSIDE that module, when it is not the island's Pascal name
  --force              overwrite an existing scaffolded component

${color.bold('island snapshot flags:')}
  --update             record baselines as FILES beside the evidence (the in-repo model)
  --remote [url]       compare against the host's ACCEPTED baseline; nothing is written to git
  --accept [name]      move the accepted pointer to what was last rendered
  --changed [base]     only islands/regions this branch touched — widens back to everything, loudly,
                       when a changed file belongs to no single one
  --json          machine-readable report

${color.bold('lagoon group flags:')}
  --all                compose EVERY repository the host knows, at its switcher entry
  --add <repo>[:<slug>][,…]     add members (slug defaults to 'all', the switcher)
  --remove <repo>[:<slug>][,…]  remove members (no slug removes every slug of that repo)
  --remote <url>       the host (default: $MOTU_HOST_URL, then ~/.config/motu/host.json)
  --json          machine-readable report

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
  // RESTORE THE NO-INSTALL LINKS FIRST, on every run.
  //
  // `motu init` symlinks node_modules/@motu/* into the checkout, which is what lets a project depend
  // on nothing. `npm install` then deletes them as extraneous — measured on an Angular app, where the
  // next build failed with `Cannot find module '@motu/react'`, an error pointing nowhere near the
  // cause. (bun and pnpm left them alone, so this is invisible on the machines motu grew up on.)
  // Re-linking is a handful of existsSync calls and makes the mechanism survive the host's package
  // manager instead of losing to it.
  try {
    ensureNoInstallLinks(REPO_ROOT, MOTU_CHECKOUT);
  } catch {
    // Not a motu project, or a read-only checkout — the commands that need the links say so themselves.
  }
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

  // Everything a page needs before its FIRST island — the step that makes adoption feel expensive.
  if (group === 'region') {
    if (sub === 'init') return regionInitCommand(argv);
    // What the region DOES, against what it previews. The only check here that compares motu to
    // reality rather than to a declaration — see the command's own header.
    if (sub === 'coverage') return regionCoverageCommand(argv);
    console.error(color.red(`unknown: motu region ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  // The last mile, and its own verb because it asks about the HOST, not about motu's files:
  // `motu integrate check [region]`.
  if (group === 'integrate') {
    // `rest` is already everything after the sub-verb, so the region positional is argv._[0].
    if (sub === 'check') return integrateCheckCommand(argv);
    console.error(color.red(`unknown: motu integrate ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'island') {
    if (sub === 'create') return createCommand(argv);
    if (sub === 'verify') return verifyCommand(argv);
    if (sub === 'snapshot') return snapshotCommand(argv);
    if (sub === 'defaults') return islandDefaultsCommand(argv);
    if (sub === 'sync') return islandSyncCommand(argv);
    if (sub === 'integrate') return integrateCommand(argv);
    console.error(color.red(`unknown: motu island ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  if (group === 'archipelago') {
    // `snapshot` takes an id positional, so re-parse with `rest` shifted.
    if (sub === 'snapshot') return archipelagoSnapshotCommand(parse(rest));
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
    // `group` takes a NAME positional, so re-parse with `rest` shifted (same shape as skills install).
    if (sub === 'group') return lagoonGroupCommand(parse(rest));
    if (sub === 'groups') return lagoonGroupsCommand(argv);
    if (sub === 'dev') return lagoonDevCommand(argv);
    if (sub === 'eject') return lagoonEjectCommand(argv);
    if (sub === 'publish') return lagoonPublishCommand(argv);
    if (sub === 'serve') return lagoonServeCommand(argv);
    console.error(color.red(`unknown: motu lagoon ${sub ?? ''}`));
    console.log(USAGE);
    process.exit(2);
  }

  // Single-word verbs: their flags land in `sub`, since `argv` is parsed from what follows it.
  if (group === 'removal-check') return removalCheckCommand(parse([sub, ...rest].filter(Boolean)));

  if (group === 'check') return checkCommand(parse([sub, ...rest].filter(Boolean)));

  if (group === 'contract') {
    if (sub === 'check') return contractCheckCommand(argv);
    console.error(color.red(`unknown: motu contract ${sub ?? ''}`));
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
