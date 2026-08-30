// What the lagoon VIEW's evidence is made of, in one module both sides import.
//
// The island scenarios and the region flows need the same catalogue, and a second copy of it is a
// third description of the same screen that nobody diffs. Typed against the APPLICATION's own types
// with `import type`, so it erases at runtime and the loaders that read these files by hand are
// unaffected — while a renamed field fails the build here rather than quietly previewing last
// month's shape.
//
// THE VOCABULARY IS THIS HOST'S OWN. These are the regions and flows `host-app` really declares, read
// off its own lagoon rather than invented: a fixture that names a region this application does not
// have renders perfectly and describes a product that does not exist.
import type { LagoonStation, LagoonState } from '../../../app/lagoon-view-region';

/** The four regions this host's own lagoon declares, in catalogue order. */
export const STATIONS: LagoonStation[] = [
  { id: 'corpus', label: 'corpus' },
  { id: 'index', label: 'index' },
  { id: 'review', label: 'review' },
  { id: 'signin', label: 'signin' },
];

/** `review`'s flows — the region with the most of them, so a list is worth drawing. */
export const REVIEW_STATES: LagoonState[] = [
  { name: 'each slot renders its own island' },
  { name: 'picking a project is what the shot list is for' },
  { name: 'picking a shot is what the viewer is for' },
  { name: 'the view toggle changes what the viewer shows' },
  { name: 'arriving scoped to one project' },
  { name: 'browsable, with the project picker' },
];

/** `corpus`'s flows — a different set, which is what makes switching region visible in the list. */
export const CORPUS_STATES: LagoonState[] = [
  { name: 'each slot renders its own island' },
  { name: 'narrowing the filter changes what the list shows' },
];

/** A region that declares none. The state the strip stands down for. */
export const NO_STATES: LagoonState[] = [];
