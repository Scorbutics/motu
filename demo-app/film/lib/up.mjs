// Sets the stage: one tmux session the fullscreen terminal attaches to.
//
//   stage   Claude Code (left) │ the agents' worktrees (right)    ← the build is filmed here
//   shell   a plain shell with a short prompt                     ← motu check, the failure
//   ctl     record.mjs, waiting for you to press Enter            ← never on camera
//
// F9 (anywhere in the session) is the manual cue: "the build is done, move on".
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { REPO, FILM, TMUX, CLAUDE_CMD, TAKES } from '../config.mjs';
import { tmux, hasSession, SHELL_PROMPT } from './tmux.mjs';

if (hasSession()) {
  console.log(`tmux session "${TMUX}" already exists — attaching. (Start over: tmux kill-session -t ${TMUX})`);
} else {
  const since = Date.now();
  const shell = `env PS1='\\[\\e[2m\\]${SHELL_PROMPT}\\[\\e[0m\\] ' bash --norc --noprofile`;

  tmux('new-session', '-d', '-s', TMUX, '-n', 'stage', '-c', REPO, '-x', '200', '-y', '50');
  tmux('send-keys', '-t', `${TMUX}:stage.0`, CLAUDE_CMD, 'Enter');
  tmux('split-window', '-h', '-l', '38%', '-t', `${TMUX}:stage.0`, '-c', REPO,
    `node ${path.join(FILM, 'lib/watch-worktrees.mjs')} --since ${since}`);
  tmux('select-pane', '-t', `${TMUX}:stage.0`);

  tmux('new-window', '-d', '-t', TMUX, '-n', 'shell', '-c', REPO, shell);
  tmux('new-window', '-t', TMUX, '-n', 'ctl', '-c', FILM, `node ${path.join(FILM, 'record.mjs')}; exec bash`);

  // A clean frame: no status bar, quiet borders, nothing that says "tmux".
  for (const [k, v] of [['status', 'off'], ['pane-border-style', 'fg=colour238'], ['pane-active-border-style', 'fg=colour238'], ['mouse', 'off']]) {
    tmux('set-option', '-t', TMUX, k, v);
  }
  tmux('bind-key', '-n', 'F9', 'run-shell', `touch ${path.join(TAKES, '.cue')}`);
}

spawnSync('tmux', ['attach', '-t', `${TMUX}:ctl`], { stdio: 'inherit' });
