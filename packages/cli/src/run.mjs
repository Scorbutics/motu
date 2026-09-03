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
import { archipelagoInitCommand } from './commands/archipelago-init.mjs';
import { regionCoverageCommand } from './commands/region-coverage.mjs';
import { archipelagoCreateCommand } from './commands/archipelago.mjs';
import { archipelagoAdoptRootCommand } from './commands/adopt-root.mjs';
import { archipelagoRecordFrameCommand } from './commands/record-frame.mjs';
import { codegenCommand } from './commands/codegen.mjs';
import { fixturesRecordCommand } from './commands/fixtures.mjs';
import { islandDefaultsCommand, islandSyncCommand } from './commands/defaults.mjs';
import { archipelagoSyncCommand } from './commands/archipelago-sync.mjs';
import { removalCheckCommand } from './commands/removal-check.mjs';
import { lagoonPublishCommand, lagoonServeCommand, lagoonDevCommand, lagoonEjectCommand, lagoonStatesCommand } from './commands/lagoon.mjs';
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
  motu link [--check]                               record @motu/* in package.json (npm deletes bare links)
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
  motu integrate check [region]                     does the HOST compose, place and read the region?
  motu archipelago init <id> --page <file>          scaffold everything a page needs before its 1st island
  motu archipelago create <id>                      scaffold + register a new archipelago
  motu archipelago verify <id|--all>                boot the whole region in the lagoon + config checks
  motu archipelago snapshot <id|--all> --remote      picture the COMPOSED page — catches arrangement
  motu archipelago record-frame <id> --url <u>      capture per-mountpoint frames from the live ocean
  motu archipelago sync                             regenerate the region-side derived files
  motu archipelago coverage <id> [--corpus <f>]     states production reached that no flow previews
    --json --ids --accept <id> --fail-above <n>     machine-readable · print ids · accept one · gate
    --forget <id> | --forget-all                    remove a state the instrument recorded wrongly
  motu fixtures record <island>                     capture backend responses into request-keyed fixtures
  motu lagoon dev [island]                          serve the lagoon with HMR (the iteration loop)
  motu lagoon dev --no-live                         ...without announcing it to the lagoon host
  motu lagoon states [island|region]                every state the lagoon can be OPENED in, as a URL
  motu lagoon eject                                 write the framework's lagoon entries into the project
  motu lagoon publish [island]                      build the lagoon as one self-contained page to publish
  motu lagoon publish --remote <url>                ...and upload it to a lagoon host (see motu-host)
  motu lagoon serve [island]                        build that same page and serve it (preview it in a browser)
  motu lagoon serve --watch --host                  ...and keep it current: rebuild on save, reload viewers
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

${color.bold('lagoon states:')}
  ${color.dim('an island scenario and a region flow are ADDRESSES — open the lagoon directly on one:')}
  ${color.dim('  /?target=island:x-week-actions&scenario=a%20week%20to%20answer')}
  ${color.dim('  /?flow=marking%20a%20mission%20done&step=2')}
  ${color.dim('  both against the gallery — the entry `serve` and `publish` build, and the one a person opens')}
  --base <url>    print absolute URLs against a running lagoon instead of paths
  --json          machine-readable catalogue
  ${color.dim('a name that resolves to nothing REFUSES to render — it never falls back to the default state.')}

${color.bold('lagoon serve flags:')}
  --port <n>      port to listen on (default 8817)
  --host          also serve on your LAN, to open it on a phone on the same wifi
  --no-build      serve the last published artifact instead of rebuilding
  --watch         rebuild on every source change and live-reload open viewers (phones included)
  --live-url <url>  the address the HOST should fetch this from, when it is not on this machine
  --live-push     send the built page to the host after every save, instead of being fetched
  ${color.dim('takes the same target/--fit flags as publish. Ctrl-C to stop.')}
  ${color.dim('--live-url needs --host, and the host must ALLOW the name (MOTU_LIVE_ALLOW there):')}
  ${color.dim('  motu lagoon serve --watch --host --live-url http://192.168.1.20:8901')}
  ${color.dim('the address is whatever the HOST can reach: a LAN IP, a tailnet peer, a tunnel. An')}
  ${color.dim('ingress/funnel name usually is NOT — those publish one port, and not this one.')}
  ${color.dim('--live-push needs nothing to reach you at all: it uploads the page (~0.5 MB) each')}
  ${color.dim('save, and the host serves those bytes. Use it when there is no route back to you.')}

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
  ${color.dim('a page, a screen, an app-side source, the lagoon map or a shared evidence module belongs to no')}
  ${color.dim('island, so a real session usually widens. To check ONE region while you work, name it:')}
  ${color.dim('  motu archipelago verify <id> --runtime   ·   motu island verify <name> --runtime')}
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

  // `--help` ON A SUBCOMMAND. It used to be parsed as an ordinary flag, so `motu island create --help`
  // reached the command with no positional, printed its usage line, and exited 2 — the code that means
  // "a check could not run, retry, do NOT repair". Asking for help is neither a failure nor an
  // environment problem, and this was the FIRST command two cold-start agents typed for each verb.
  // Handled once, here, so every subcommand answers the same way instead of each remembering to.
  // `sub` IS CHECKED TOO, and leaving it out was worse than the bug it was fixing. On a top-level verb
  // (`motu init --help`) the flag lands in `sub`, not in `rest`, so `argv.help` was false, dispatch
  // fell through, and `init` treated the missing positional as "." — `motu init --help` SCAFFOLDED
  // MOTU INTO THE CURRENT DIRECTORY and exited 0. Found by a cold-start agent typing it in its repo,
  // where the existing config refused the overwrite and only an exit 1 showed; reproduced in an empty
  // directory, where it silently created a project.
  const askedForHelp = ['--help', '-h', 'help'].includes(sub) || argv.help || rest.includes('-h');
  if (askedForHelp) {
    console.log(USAGE);
    console.log(color.dim(`\n(\`motu ${group}${sub ? ' ' + sub : ''}\` — see the usage block above; each command also prints its own usage when required arguments are missing.)`));
    process.exit(0);
  }

  if (group === 'init') {
    // Top-level verb: sub is an optional target dir positional.
    return initCommand(parse([sub, ...rest].filter((x) => x !== undefined)));
  }

  // `motu link` — record @motu/* in package.json so the package manager stops deleting them.
  // `--check` asserts instead of writing, which is the CI half of the same question.
  if (group === 'link') {
    const { linkCommand } = await import('./commands/link.mjs');
    return linkCommand(parse([sub, ...rest].filter((x) => x !== undefined)));
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
    // Everything a page needs before its FIRST island — the step that makes adoption feel expensive.
    if (sub === 'init') return archipelagoInitCommand(argv);
    // What the region DOES, against what it previews. The only check here that compares motu to
    // reality rather than to a declaration — see the command's own header.
    if (sub === 'coverage') return regionCoverageCommand(argv);
    // The migration `region-root` points at: derive `root` + `slots` from the frame, hand back the rest.
    if (sub === 'adopt-root') return archipelagoAdoptRootCommand(parse(rest));
    if (sub === 'verify') return archipelagoVerifyCommand(argv);
    if (sub === 'record-frame') return archipelagoRecordFrameCommand(argv);
    // The region-side counterpart to `island sync`. See the command's own header for why it exists.
    if (sub === 'sync') return archipelagoSyncCommand(argv);
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
    if (sub === 'dev') return lagoonDevCommand(argv);
    if (sub === 'states') return lagoonStatesCommand(argv);
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
