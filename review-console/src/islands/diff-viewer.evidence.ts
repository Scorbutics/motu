// Lagoon EVIDENCE for diff-viewer.
//
// The picture is the reason this console exists, and it had no scenarios — so a restyle of the frame
// around it could not be looked at before or after. These are the states the frame can be in; the
// image itself needs `shotUrl`, which the lagoon supplies as a stand-in (see roots/lagoon/src/lagoon.tsx).
import type { Scenario } from '@motu/runtime/mock';
import { SELECTED, SHOTS } from '../shared/review-evidence.js';

export const scenarios: Scenario[] = [
  // What the viewer opens as. A sentence, not an empty frame — an empty frame reads as a failed load.
  { name: 'nothing picked', seed: { shot: null, shots: SHOTS } },
  // A shot that CHANGED: the difference toggle is the only one the status enables.
  { name: 'a changed shot', seed: { shot: SELECTED, shots: SHOTS, mode: 'last' } },
  // Where the pixel diff actually lives. The host does not produce it, so the viewer says where to
  // look rather than pretending it has one.
  { name: 'the difference', seed: { shot: SELECTED, shots: SHOTS, mode: 'diff' } },
  // A shot that has never been accepted: "accepted" has nothing to show, and says which of the two
  // reasons it is.
  { name: 'never accepted', seed: { shot: { island: 'load-error', shot: 'nothing-wrong@desktop' }, shots: SHOTS, mode: 'accepted' } },
  // A SHOT THE REGION HAS NO RECORD OF — crossed with a picked shot rather than varied alone. It is
  // what the viewer shows for the moment between selecting a project and its shots arriving, and the
  // frame still has to name what it is looking for.
  { name: 'the shots have not arrived', seed: { shot: SELECTED, shots: [], mode: 'last' } },
];
