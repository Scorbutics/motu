// Declared FLOWS for the review console — the couplings, as something that runs.
//
// Each step ends on what ANOTHER island RENDERS, never on the key it just set: a step whose `expect`
// names its own `provide`'s target asserts that the lagoon stored what it was handed, which cannot
// fail unless the lagoon is broken.
import type { RegionScenario } from '@motu/runtime/mock';
import { REPOS, SHOTS, SELECTED } from '../../shared/review-evidence.js';

// EVERY KEY THE PAGE ESTABLISHES, not just the interesting ones.
//
// `busy` and `error` were absent here while `App.tsx` seeds all seven, so every flow ran against a
// region shaped differently from the one users get — a missing COLUMN rather than a missing scenario,
// and internally consistent on both sides, so nothing noticed. `integrate check`'s `flow-shape` does
// now.
const SEED = {
  // NULL, so every existing flow previews the BROWSABLE console — the one with a picker. The scoped
  // shape is a flow of its own below, which is the only way anyone sees it: it depends on a URL
  // parameter, and no amount of clicking around a running host produces it.
  scopedRepo: null,
  repos: REPOS,
  selectedRepo: 'acme/example-app',
  shots: SHOTS,
  viewMode: 'last' as const,
  busy: false,
  error: null,
};

export const scenarios: RegionScenario[] = [
  {
    // Coverage: each slot renders its OWN island. Text one alone produces — a repo name only the
    // picker prints, a status only the summary prints, an island heading only the list prints.
    name: 'each slot renders its own island',
    seed: SEED,
    steps: [
      { expectRender: { 'repo-picker': 'twentyhq/twenty', 'status-summary': 'changed' } },
      { expectRender: { 'shot-list': 'week-actions', 'accept-bar': 'Accept all' } },
    ],
  },
  {
    // THE ONE THAT WAS MISSING, and the console shipped broken in the lagoon for want of it.
    //
    // "Picking a repo changes what the list shows" is the first promise the archipelago makes, and it
    // had no flow — because the page performed it, and a flow can only drive the region. So the shot
    // list rendered the seeded project's shots for every card, nothing failed, and the published
    // lagoon looked like a console whose project rail does nothing.
    //
    // It asserts what ANOTHER island renders — `region-actions` is an island name only motu's own
    // baselines carry, so it cannot appear unless the selection genuinely reached the source and the
    // source genuinely answered for that project.
    name: 'picking a project is what the shot list is for',
    seed: SEED,
    steps: [
      { expectRender: { 'shot-list': 'week-actions' } },
      {
        emit: { slot: 'repo-picker', event: 'repo-selected', detail: 'Scorbutics/motu' },
        expectRender: { 'shot-list': 'region-actions' },
      },
    ],
  },
  {
    // THE coupling this console exists for: the list picks, the viewer follows. Two different
    // islands, one region key between them, and nothing but the region carries it.
    name: 'picking a shot is what the viewer is for',
    seed: SEED,
    steps: [
      { expectRender: { 'diff-viewer': 'Pick a shot' } },
      {
        emit: { slot: 'shot-list', event: 'shot-selected', detail: SELECTED },
        expectRender: { 'diff-viewer': 'compact-rows@mobile' },
      },
    ],
  },
  {
    // The viewer owns its own mode, and the toggle has to reach the image it names.
    name: 'the view toggle changes what the viewer shows',
    seed: { ...SEED, selectedShot: SELECTED },
    steps: [
      {
        emit: { slot: 'diff-viewer', event: 'view-changed', detail: 'diff' },
        expectRender: { 'diff-viewer': '.diff.png' },
      },
    ],
  },
  {
    /**
     * ARRIVING FROM A LAGOON, already scoped to one project.
     *
     * The console is reached two ways and they are different screens. From a lagoon's own sidebar it
     * comes with `?repo=`, and the page draws NO project column: you have just come from the list
     * that would be in it. Typed straight, there is no project yet and the picker is how you choose.
     *
     * ONLY A SEEDED STATE SHOWS THIS ONE. The lagoon mounts every declared slot, because there is no
     * page there to have an opinion — so until `scopedRepo` named the condition in the archipelago's
     * `slots`, the preview always drew the picker and the scoped screen was unreachable in the one
     * surface built for looking at screens.
     *
     * NO STIMULUS, DELIBERATELY. This asserts "with a project already chosen, the desk is the shots
     * and the viewer" — a claim about a STATE rather than a data flow, which is the form the rules
     * allow when the input IS the seed. Its pair below is the same region without the key, and the
     * two together are what make the condition visible: one address each.
     */
    name: 'arriving scoped to one project',
    seed: { ...SEED, scopedRepo: 'acme/example-app' },
    steps: [{ expectRender: { 'shot-list': 'compact-rows@mobile' } }],
  },
  {
    /** The browsable console: no project decided yet, so the picker is how you choose one. */
    name: 'browsable, with the project picker',
    seed: SEED,
    steps: [{ expectRender: { 'repo-picker': 'acme/example-app' } }],
  },
];
