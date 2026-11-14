// THE EDIT, as data. Each shot is a stretch of the recording between two markers that record.mjs
// wrote, squeezed (or not) into `seconds` of film. Change a caption or a duration here and re-render;
// open `pnpm studio` to scrub it first.
//
// The words are the film's voice — there is no narration. Keep each one readable in about a second,
// and keep every claim one the demo actually shows (see ../../RECORDING.md, "What is NOT proved").

export type Shot = {
  from: string; // marker id where the shot starts
  to: string; //   marker id where it ends
  seconds: number; // length on screen; the footage is sped up to fit, never slowed down
  caption?: string;
  sub?: string;
  /** A slow push-in: scale reached at the end of the shot, around a point given in % of the frame. */
  zoom?: { scale: number; x: number; y: number };
};

export const CUT: Shot[] = [
  { from: 'wall', to: 'wall-end', seconds: 9, caption: 'Every state of your app.', sub: 'Each at its own URL. No backend, no login.' },
  { from: 'real', to: 'declared', seconds: 6, caption: 'A real app. A real Postgres.' },
  { from: 'declared', to: 'prompt', seconds: 4, caption: 'Three islands declared. None built.', sub: 'Their ownership is already enforced.', zoom: { scale: 1.35, x: 45, y: 40 } },
  { from: 'prompt', to: 'build', seconds: 9, zoom: { scale: 1.3, x: 20, y: 90 } },
  { from: 'build', to: 'built', seconds: 16, caption: 'One agent per island.', sub: 'In parallel, each in its own worktree.' },
  { from: 'lagoon', to: 'lagoon-end', seconds: 12, caption: 'Pick a day. Pick a slot.', sub: 'The summary confirms it — every step is a URL.' },
  { from: 'checks', to: 'failure', seconds: 5, caption: 'Checked.' },
  { from: 'failure', to: 'failure-end', seconds: 9, caption: 'Two islands writing one key?', sub: "It doesn't build.", zoom: { scale: 1.2, x: 30, y: 30 } },
  { from: 'same', to: 'end', seconds: 8, caption: 'Same component. Different answers.', sub: 'Recorded fixtures on the left, live Postgres on the right.' },
];

export const END_CARD_SECONDS = 4.5;
export const FPS = 30;
