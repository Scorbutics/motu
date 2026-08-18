// `motu archipelago record-frame <id> --url <embedded>` — capture the per-mountpoint "callsite frames"
// of an archipelago from the LIVE embedded ocean, so the lagoon's mountpoint gallery can mimic the real
// placement offline. It opens a headed, persistent browser (log in + navigate once), measures each
// <motu-island slot>'s container box + inherited typography, and writes a recorded frame stylesheet
// keyed by [data-motu-arch][data-motu-slot] — the record/replay analogue of `motu fixtures record`,
// but for placement instead of backend responses. Replaces the hand-authored frame CSS.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { paths, color, REPO_ROOT } from '../lib/util.mjs';
import { recordFrames } from '../playwright-lagoon.mjs';

const EMPTY = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);
// Persist the login/session across runs so the human only authenticates once.
const PROFILE_DIR = resolve(REPO_ROOT, 'node_modules/.cache/motu-record-profile');

/** One recorded frame -> the CSS rule the gallery cell reads. Skips default/empty values. */
function frameRule(id, f) {
  const sel = `.motu-frame[data-motu-arch="${id}"][data-motu-slot="${f.slot}"] .motu-frame__stage`;
  const decls = [];
  if (f.width > 0) decls.push(`max-width: ${f.width}px`);
  if (f.padding && !/^(0px ?)+$/.test(f.padding.trim())) decls.push(`padding: ${f.padding}`);
  if (f.background && !EMPTY.has(f.background)) decls.push(`background: ${f.background}`);
  if (f.color) decls.push(`color: ${f.color}`);
  if (f.fontFamily) decls.push(`font-family: ${f.fontFamily}`);
  if (f.fontSize) decls.push(`font-size: ${f.fontSize}`);
  if (f.lineHeight && f.lineHeight !== 'normal') decls.push(`line-height: ${f.lineHeight}`);
  return `${sel} { ${decls.join('; ')}; }`;
}

function renderFrameCss(id, frames) {
  return (
    `/* Recorded from the embedded ocean by \`motu archipelago record-frame ${id}\` — the stand-in\n` +
    `   geometry for each mountpoint's real callsite. Lagoon-only; re-record rather than hand-editing. */\n` +
    frames.map((f) => frameRule(id, f)).join('\n') +
    '\n'
  );
}

export async function archipelagoRecordFrameCommand(argv) {
  const id = argv._[0];
  const url = argv.url;
  if (!id || !url) {
    console.error('usage: motu archipelago record-frame <id> --url <embedded-url> [--out <path>] [--headless]');
    console.error(color.dim('  <embedded-url> = a page of the running ocean where this archipelago\'s islands are placed'));
    process.exit(2);
  }

  let frames;
  try {
    frames = await recordFrames({ url, headed: argv.headless !== true, userDataDir: PROFILE_DIR });
  } catch (err) {
    const msg = String(err?.message || err).split('\n')[0];
    if (/Executable doesn't exist|playwright install/i.test(msg)) {
      console.error(color.red('✗ Chromium not installed — run `npx playwright install chromium` (in packages/cli)'));
    } else {
      console.error(color.red(`✗ record-frame failed: ${msg}`));
    }
    process.exit(1);
  }

  if (!frames.length) {
    console.error(color.red('✗ no <motu-island slot> mountpoints found on the page — nothing recorded'));
    process.exit(1);
  }

  const outPath = argv.out
    ? resolve(process.cwd(), argv.out)
    : resolve(paths.lagoonDir, 'src/frames', `${id}.frame.css`);
  mkdirSync(resolve(outPath, '..'), { recursive: true });
  writeFileSync(outPath, renderFrameCss(id, frames));

  console.log(color.green(`✓ recorded ${frames.length} mountpoint frame(s) for ${color.bold(id)}`) + color.dim(` -> ${paths.rel(outPath)}`));
  for (const f of frames) {
    console.log('  ' + color.dim(`${f.slot}  width=${f.width}px  pad=${f.padding}`));
  }
  console.log(color.dim('\nThe lagoon picks up src/frames/*.css automatically — reload it to see the recorded placement.'));
}
