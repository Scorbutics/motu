import { execFileSync } from 'node:child_process';
import { TMUX } from '../config.mjs';

export const tmux = (...args) => execFileSync('tmux', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hasSession = () => {
  try { tmux('has-session', '-t', TMUX); return true; } catch { return false; }
};

/** Shows a window to whoever is attached — the camera's cut between terminal views. */
export const show = (win) => tmux('select-window', '-t', `${TMUX}:${win}`);

/** Types like a person: one character at a time, a little uneven, a beat after punctuation. */
export async function type(target, text, { cps = 22 } = {}) {
  for (const ch of text) {
    tmux('send-keys', '-t', target, '-l', ch);
    const base = 1000 / cps;
    await sleep(base * (0.6 + Math.random() * 0.8) + (/[.,]/.test(ch) ? 180 : 0));
  }
}

export const enter = (target) => tmux('send-keys', '-t', target, 'Enter');

// The on-camera shell's prompt (set by up.mjs). A command has ended when this is the last line again.
export const SHELL_PROMPT = 'motu ❯';

const lastLine = (target) =>
  capture(target).split('\n').map((l) => l.trimEnd()).filter(Boolean).at(-1) ?? '';

/** Types a shell command in the on-camera shell, runs it, and waits for the prompt to come back. */
export async function run(target, command, { timeoutMs = 120_000, cps = 30 } = {}) {
  await type(target, command, { cps });
  await sleep(500);
  enter(target);
  await sleep(800);
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (lastLine(target) === SHELL_PROMPT) return true;
    await sleep(400);
  }
  return false;
}

export const clear = (target) => { tmux('send-keys', '-t', target, 'C-l'); };

export const capture = (target) => {
  try { return tmux('capture-pane', '-p', '-J', '-t', target); } catch { return ''; }
};
