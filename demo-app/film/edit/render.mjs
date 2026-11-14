// Renders the cut, then fits it under GitHub's 10 MB README upload limit (free accounts) with a
// two-pass encode aimed at 9.5 MB. Output: edit/out/hero.mp4 (upload this) and master.mp4 (keep).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FILM } from '../config.mjs';

const out = path.join(FILM, 'edit/out');
fs.mkdirSync(out, { recursive: true });
const master = path.join(out, 'master.mp4');
const hero = path.join(out, 'hero.mp4');
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: FILM });

sh('npx', ['remotion', 'render', 'edit/src/index.ts', 'Hero', master, '--codec', 'h264', '--crf', '14', '--concurrency', '50%']);

const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', master], { encoding: 'utf8' }));
const kbps = Math.floor((9.5 * 8 * 1024) / seconds) - 20;
const pass = (n, dst) => ['-y', '-v', 'error', '-i', master, '-an', '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${kbps}k`, '-pass', String(n), '-passlogfile', path.join(out, 'x264'), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...(n === 1 ? ['-f', 'mp4', '/dev/null'] : [dst])];
sh('ffmpeg', pass(1));
sh('ffmpeg', pass(2, hero));
for (const f of fs.readdirSync(out)) if (f.startsWith('x264')) fs.rmSync(path.join(out, f));

const mb = (fs.statSync(hero).size / 1024 / 1024).toFixed(2);
console.log(`\n${hero} — ${seconds.toFixed(1)} s, ${mb} MB (${kbps} kb/s). Drag it into the README editor on github.com.`);
