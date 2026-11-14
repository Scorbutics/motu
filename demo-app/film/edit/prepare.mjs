// Hands one take to the edit: the OBS recording remuxed to MP4 (no re-encode), its markers, the icon.
//   node edit/prepare.mjs <take>          e.g. take-1
//
// A take can have TWO parts (record.mjs FILM_RESUME=1 after a stop mid-build): markers.json and
// markers.part2.json, one recording each. They are joined end to end without re-encoding, and part
// 2's markers are shifted by part 1's length, so the cut sees one take. Part 1's `error` marker (the
// stop itself) is dropped; the build shot then runs from `build` across the join to `built`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TAKES, REPO, FILM } from '../config.mjs';

const take = process.argv[2];
if (!take) { console.error('usage: pnpm prepare-edit <take>   (one of: ' + fs.readdirSync(TAKES).filter((d) => !d.startsWith('.')).join(', ') + ')'); process.exit(1); }
const dir = path.join(TAKES, take);

const recordingOf = (meta, nth) => {
  if (meta.recording && fs.existsSync(meta.recording)) return meta.recording;
  const all = fs.readdirSync(dir).filter((f) => /\.(mkv|mp4|mov)$/.test(f)).map((f) => path.join(dir, f)).sort();
  return all[nth];
};
const duration = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' })) * 1000;

const parts = ['markers.json', 'markers.part2.json', 'markers.part3.json']
  .filter((f) => fs.existsSync(path.join(dir, f)))
  .map((f, i) => {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { meta, src: recordingOf(meta, i) };
  });
if (!parts.length || parts.some((p) => !p.src)) { console.error(`no recording/markers in ${dir}`); process.exit(1); }

let offset = 0;
const markers = [];
for (const [i, p] of parts.entries()) {
  const last = i === parts.length - 1;
  for (const m of p.meta.markers) {
    if (!last && m.id === 'error') continue; // the stop that the next part resumes from
    markers.push({ ...m, t: m.t + offset });
  }
  offset += duration(p.src);
}
const meta = { ...parts[0].meta, markers, parts: parts.map((p) => p.src) };

const pub = path.join(FILM, 'edit/public');
fs.mkdirSync(pub, { recursive: true });
const out = path.join(pub, 'take.mp4');
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });

let input = ['-i', parts[0].src];
if (parts.length > 1) {
  const list = path.join(dir, 'parts.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p.src.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  input = ['-f', 'concat', '-safe', '0', '-i', list];
}
console.log(`joining ${parts.length} part(s) → ${out}`);
try {
  ff([...input, '-c', 'copy', '-an', '-movflags', '+faststart', out]);
} catch {
  console.log('stream copy refused — re-encoding (slower)');
  ff([...input, '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', out]);
}
// THE BUILD, TERMINAL ONLY. While they verify, the agents open their own (headed) browser windows and
// the window switcher over the terminal; at 140× that strobes. Each second of the build is measured:
// the terminal is dark (mean luma < 70), a page is light (> 80) — nothing sits between. Runs of 4 s
// or more of terminal are kept and the build shot plays them back to back (cut.ts `terminalOnly`).
const at = (id) => markers.find((m) => m.id === id)?.t;
if (at('build') != null && at('built') != null) {
  const a = at('build') / 1000, b = at('built') / 1000;
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(a), '-to', String(b), '-i', out,
    '-vf', 'fps=1,scale=32:18', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 28 });
  const px = 32 * 18, ranges = [];
  let run = null;
  for (let i = 0; i <= buf.length / px; i++) {
    let sum = 0;
    for (let k = 0; i < buf.length / px && k < px; k++) sum += buf[i * px + k];
    const dark = i < buf.length / px && sum / px < 70;
    if (dark && run === null) run = i;
    if (!dark && run !== null) { if (i - run >= 4) ranges.push([(a + run) * 1000, (a + i) * 1000]); run = null; }
  }
  meta.terminalOnly = { from: 'build', to: 'built', ranges };
  console.log(`build: ${ranges.length} terminal stretch(es), ${Math.round(ranges.reduce((s, r) => s + r[1] - r[0], 0) / 1000)} s of ${Math.round(b - a)} s`);
}
// THE BEFORE SCREEN, from a rehearsal: `--before dry-<time>` cuts that take's lagoon scene (recorded
// before any build, same setup) into before.mp4 — the empty member screen the calendar will fill.
const bi = process.argv.indexOf('--before');
if (bi > 0) {
  const bdir = path.join(TAKES, process.argv[bi + 1]);
  const bm = JSON.parse(fs.readFileSync(path.join(bdir, 'markers.json'), 'utf8'));
  const t = (id) => bm.markers.find((m) => m.id === id).t / 1000;
  const bsrc = bm.recording && fs.existsSync(bm.recording)
    ? bm.recording
    : fs.readdirSync(bdir).filter((f) => f.endsWith('.mkv')).map((f) => path.join(bdir, f))[0];
  ff(['-ss', String(t('lagoon')), '-to', String(t('lagoon-end')), '-i', bsrc, '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', '-pix_fmt', 'yuv420p', path.join(pub, 'before.mp4')]);
  meta.before = { take: process.argv[bi + 1], seconds: t('lagoon-end') - t('lagoon') };
  console.log(`before: ${meta.before.seconds.toFixed(1)} s from ${meta.before.take}`);
}
fs.writeFileSync(path.join(pub, 'take.json'), JSON.stringify(meta, null, 2));
fs.copyFileSync(path.join(REPO, 'assets/motu-icon.svg'), path.join(pub, 'motu-icon.svg'));
console.log('markers:', markers.map((m) => `${m.id}@${(m.t / 1000).toFixed(1)}s`).join('  '));
console.log('next: pnpm studio (scrub, tune edit/src/cut.ts) · pnpm render');
