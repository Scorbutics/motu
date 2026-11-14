// THE EDIT, as data. Each shot is a stretch of the recording between two markers that record.mjs
// wrote, squeezed (or not) into `seconds` of film. Change a caption or a duration here and re-render;
// open `pnpm studio` to scrub it first.
//
// The words are the film's voice — there is no narration. Keep each one readable in about a second,
// and keep every claim one the demo actually shows (see ../../RECORDING.md, "What is NOT proved").

export type Shot = {
  from: string; // marker id where the shot starts
  to: string; //   marker id where it ends
  /** Read from before.mp4 (prepare-edit --before) instead of the take; `from`/`to` are then labels. */
  clip?: 'before';
  seconds: number; // length on screen; the footage is sped up to fit, never slowed down
  caption?: string;
  sub?: string;
  /** A slow push-in: scale reached at the end of the shot, around a point given in % of the frame. */
  zoom?: { scale: number; x: number; y: number };
  /** Use only the last `tail` seconds before `to` — for a command whose output lands at the end. */
  tail?: number;
  /** Use only the first `head` seconds after `from` — to hold on a moment and drop what follows. */
  head?: number;
  /** Play only the stretches where the terminal is on screen (prepare.mjs measures them). */
  terminalOnly?: boolean;
};

// BEFORE → BUILD → AFTER. A viewer must know what is being built before watching it be built: the
// profile page and its lagoon screen are shown empty first, and the lagoon screen again once built.
export const CUT: Shot[] = [
  { from: 'wall', to: 'wall-end', seconds: 7, caption: 'Every state of your app.', sub: 'Each at its own URL. No backend, no login.' },
  { from: 'real', to: 'declared', seconds: 5, caption: 'A real app. A real Postgres.' },
  // BEFORE, 1/2: the page in the app — the goal, and the placeholder standing where it will go.
  { from: 'declared', to: 'prompt', seconds: 5, caption: 'The goal: book time with a member.', sub: 'The calendar is declared on this page — not built.', zoom: { scale: 1.35, x: 45, y: 40 } },
  // BEFORE, 2/2: the same screen in the lagoon (a rehearsal, recorded before any build) — empty.
  { from: 'before', to: 'before-end', clip: 'before', seconds: 3.5, caption: 'Same screen, in the lagoon.', sub: 'Three islands declared, none built.' },
  // Claude Code's input box sits at the bottom left: anchor there, so the prompt grows into frame.
  { from: 'prompt', to: 'build', seconds: 8, zoom: { scale: 1.3, x: 0, y: 95 } },
  // terminalOnly: the agents' own browser windows (their verification) strobe at 140× — dropped.
  { from: 'build', to: 'built', seconds: 16, terminalOnly: true, caption: 'One agent per island.', sub: 'In parallel, each in its own worktree.' },
  // AFTER: the same lagoon screen as the BEFORE shot, now filled — then the agents' flow, step by step.
  { from: 'lagoon', to: 'step', seconds: 3.5, caption: 'Built.', sub: 'The same screen, three agents later.' },
  { from: 'step', to: 'lagoon-end', seconds: 9, caption: 'Pick a day. Pick a slot.', sub: 'The summary confirms it — every step is a URL.' },
  // `motu check` prints when it ends (~16 s in): only its last seconds, where both PASS lines are.
  { from: 'checks', to: 'failure', seconds: 5, tail: 8, caption: 'Checked.' },
  // The one-line edit and the check running, at speed…
  { from: 'failure', to: 'failure-red', seconds: 4.5, caption: 'Two islands writing one key?' },
  // …then HELD on the highlighted ✗ ownership (it is on screen 5 s, then the file is restored).
  // Anchored bottom left: the one-line diff above, the error below.
  { from: 'failure-red', to: 'failure-end', head: 4.8, seconds: 4.5, caption: "It doesn't build.", sub: 'The check names both writers.', zoom: { scale: 1.2, x: 0, y: 80 } },
  { from: 'same', to: 'end', seconds: 8, caption: 'Same component. Different answers.', sub: 'Recorded fixtures on the left, live Postgres on the right.', zoom: { scale: 1.35, x: 50, y: 20 } },
];

export const END_CARD_SECONDS = 4.5;
export const FPS = 30;
