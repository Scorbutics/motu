// Hands one take to the edit: the OBS recording remuxed to MP4 (no re-encode), its markers, the icon.
//   node edit/prepare.mjs <take>          e.g. take-1
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TAKES, REPO, FILM } from '../config.mjs';

const take = process.argv[2];
if (!take) { console.error('usage: pnpm prepare-edit <take>   (one of: ' + fs.readdirSync(TAKES).filter((d) => !d.startsWith('.')).join(', ') + ')'); process.exit(1); }
const dir = path.join(TAKES, take);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'markers.json'), 'utf8'));
const src = meta.recording && fs.existsSync(meta.recording)
  ? meta.recording
  : fs.readdirSync(dir).filter((f) => /\.(mkv|mp4|mov)$/.test(f)).map((f) => path.join(dir, f)).sort().at(-1);
if (!src) { console.error(`no recording in ${dir}`); process.exit(1); }

const pub = path.join(FILM, 'edit/public');
fs.mkdirSync(pub, { recursive: true });
const out = path.join(pub, 'take.mp4');
console.log(`remuxing ${src}`);
try {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-c', 'copy', '-an', '-movflags', '+faststart', out], { stdio: 'inherit' });
} catch {
  console.log('stream copy refused — re-encoding (slower)');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' });
}
fs.writeFileSync(path.join(pub, 'take.json'), JSON.stringify(meta, null, 2));
fs.copyFileSync(path.join(REPO, 'assets/motu-icon.svg'), path.join(pub, 'motu-icon.svg'));
console.log('markers:', meta.markers.map((m) => `${m.id}@${(m.t / 1000).toFixed(1)}s`).join('  '));
console.log('next: pnpm studio (scrub, tune edit/src/cut.ts) · pnpm render');
