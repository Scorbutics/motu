// Declared FLOWS for the review console — the couplings, as something that runs.
//
// Each step ends on what ANOTHER island RENDERS, never on the key it just set: a step whose `expect`
// names its own `provide`'s target asserts that the lagoon stored what it was handed, which cannot
// fail unless the lagoon is broken.
import type { RegionScenario } from '@motu/runtime/mock';
import { REPOS, SHOTS, SELECTED } from '../../shared/review-evidence.js';

const SEED = { repos: REPOS, selectedRepo: 'Scorbutics/peps_ta_boite_app', shots: SHOTS, viewMode: 'last' as const };

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
];
