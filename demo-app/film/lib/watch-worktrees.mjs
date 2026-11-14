// The right-hand pane during the build: one box per agent worktree, its files appearing as the agent
// writes them, then what landed on the take branch once they merge. Everything shown is read from git
// and the filesystem every second — nothing here is staged.
//
//   node lib/watch-worktrees.mjs [--since <epoch ms>]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../config.mjs';

const since = Number(process.argv[process.argv.indexOf('--since') + 1]) || Date.now();
const BASE = git(REPO, 'rev-parse', 'HEAD').trim();
const ISLANDS = ['calendar-days', 'calendar-slots', 'booking-summary'];

const C = { dim: '\x1b[2m', b: '\x1b[1m', gold: '\x1b[38;5;179m', green: '\x1b[38;5;114m', cyan: '\x1b[38;5;110m', red: '\x1b[38;5;174m', r: '\x1b[0m' };

function git(cwd, ...args) {
  try { return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
}

function worktrees() {
  const out = [];
  let cur = null;
  for (const line of git(REPO, 'worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; out.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
  }
  return out.filter((w) => {
    if (path.resolve(w.path) === path.resolve(REPO) || !fs.existsSync(w.path)) return false;
    const st = fs.statSync(w.path);
    return (st.birthtimeMs || st.ctimeMs) >= since - 5000; // only this take's agents
  });
}

/** Files changed in `cwd` since the take began: committed, staged, unstaged and new. */
function changes(cwd) {
  const files = new Map();
  for (const l of git(cwd, 'diff', '--numstat', BASE).split('\n').filter(Boolean)) {
    const [add, del, f] = l.split('\t');
    files.set(f, { f, add: +add || 0, del: +del || 0, isNew: false });
  }
  for (const f of git(cwd, 'ls-files', '--others', '--exclude-standard').split('\n').filter((f) => f && !f.startsWith('.claude/'))) {
    let n = 0;
    try { n = fs.readFileSync(path.join(cwd, f), 'utf8').split('\n').length; } catch {}
    files.set(f, { f, add: n, del: 0, isNew: true });
  }
  for (const v of files.values()) {
    try { v.mtime = fs.statSync(path.join(cwd, v.f)).mtimeMs; } catch { v.mtime = 0; v.gone = true; }
    if (!v.isNew && !git(cwd, 'ls-tree', BASE, '--', v.f).trim()) v.isNew = true; // not in the base commit
  }
  return [...files.values()].sort((a, b) => b.mtime - a.mtime);
}

const islandOf = (files, fallback) => {
  const hits = ISLANDS.map((i) => [i, files.filter((f) => f.f.includes(i)).length]).sort((a, b) => b[1] - a[1]);
  return hits[0][1] ? hits[0][0] : fallback;
};

const clock = (ms) => new Date(ms).toISOString().slice(11, 19);
const ago = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60_000)}m`) + ' ago';
const vis = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s, w) => s + ' '.repeat(Math.max(0, w - vis(s)));
const cut = (s, w) => (s.length > w ? '…' + s.slice(s.length - w + 1) : s);

function box(title, sub, files, width, rows) {
  const inner = width - 4;
  const out = [`${C.dim}┌─${C.r} ${C.b}${C.gold}${title}${C.r} ${C.dim}${sub} ${'─'.repeat(Math.max(0, inner - title.length - sub.length - 2))}┐${C.r}`];
  const shown = files.slice(0, rows);
  for (const f of shown) {
    const mark = f.isNew ? `${C.green}+` : `${C.cyan}~`;
    const nums = f.isNew ? `${C.green}${f.add}${C.r}` : `${C.green}+${f.add}${C.r} ${C.red}−${f.del}${C.r}`;
    const name = cut(f.f.replace(/^demo-app\//, ''), inner - 12);
    out.push(`${C.dim}│${C.r} ${mark} ${name}${C.r}${' '.repeat(Math.max(1, inner - 2 - name.length - vis(nums)))}${nums} ${C.dim}│${C.r}`);
  }
  if (!shown.length) out.push(`${C.dim}│${C.r} ${C.dim}reading the region…${C.r}${' '.repeat(Math.max(0, inner - 19))}${C.dim}│${C.r}`);
  if (files.length > rows) out.push(`${C.dim}│ … ${files.length - rows} more${' '.repeat(Math.max(0, inner - 9 - String(files.length - rows).length))}│${C.r}`);
  const last = files[0]?.mtime ? `last write ${ago(Date.now() - files[0].mtime)}` : '';
  out.push(`${C.dim}└ ${last} ${'─'.repeat(Math.max(0, inner - last.length - 1))}┘${C.r}`);
  return out;
}

function frame() {
  const width = Math.max(40, process.stdout.columns || 80);
  const height = process.stdout.rows || 40;
  const wts = worktrees();
  const lines = [`${C.b} AGENTS AT WORK${C.r}${' '.repeat(Math.max(1, width - 26))}${C.dim}${clock(Date.now() - since)}${C.r}`, ''];

  if (wts.length) {
    const rows = Math.max(2, Math.floor((height - 4) / wts.length) - 3);
    for (const w of wts) {
      const files = changes(w.path);
      lines.push(...box(islandOf(files, w.branch ?? path.basename(w.path)), `worktree ${path.basename(w.path)}`, files, width, rows), '');
    }
  } else {
    const files = changes(REPO);
    const title = files.length ? 'on the take branch' : 'waiting for the agents';
    lines.push(...box(title, `${BASE.slice(0, 7)} → working tree`, files, width, height - 6));
  }
  process.stdout.write('\x1b[H' + lines.slice(0, height).map((l) => pad(l, width)).join('\n') + '\x1b[J');
}

process.stdout.write('\x1b[?25l\x1b[2J'); // hide the cursor
process.on('SIGINT', () => { process.stdout.write('\x1b[?25h\n'); process.exit(0); });
frame();
setInterval(frame, 1000);
