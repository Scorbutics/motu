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

const parts = ['markers.json', 'markers.part2.json']
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
fs.writeFileSync(path.join(pub, 'take.json'), JSON.stringify(meta, null, 2));
fs.copyFileSync(path.join(REPO, 'assets/motu-icon.svg'), path.join(pub, 'motu-icon.svg'));
console.log('markers:', markers.map((m) => `${m.id}@${(m.t / 1000).toFixed(1)}s`).join('  '));
console.log('next: pnpm studio (scrub, tune edit/src/cut.ts) · pnpm render');
