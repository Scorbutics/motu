// Lagoon scenarios for x-member-form.
//
// The form calls nothing — it publishes a draft and draws inputs — so its scenarios are the states
// its FIELDS can be in: empty, partly filled, and full. They render differently because the inputs
// carry different values, which is what a person checking the form actually looks at.
import type { Fixture, Scenario } from '@motu/runtime/mock';
import { COMPLETE, EMPTY, PARTIAL } from '../../shared/member-draft-evidence.js';

export const fixtures: Fixture[] = [];

export const scenarios: Scenario[] = [
  { name: 'a blank form', seed: { draft: EMPTY } },
  { name: 'partly filled', seed: { draft: PARTIAL } },
  { name: 'every field filled', seed: { draft: COMPLETE } },
];
