// The drafts BOTH sides show, in one module they each import.
//
// Evidence files are read by plain node, where the app's `@/…` alias does not resolve, so this module
// deliberately has no application imports beyond a TYPE — which erases. A renamed field then fails the
// build here rather than quietly previewing last month's shape.
import type { MemberDraft } from './member-draft.js';

/** Nothing filled in. The state the card is first seen in, and the one it must be designed for. */
export const EMPTY: MemberDraft = {};

/** Half a profile: enough to draw a name and a role, not enough to look finished. */
export const PARTIAL: MemberDraft = {
  fullName: 'Ada Lovelace',
  role: 'Instructor',
};

/** A complete profile, listed publicly — every element of the card at once. */
export const COMPLETE: MemberDraft = {
  fullName: 'Ada Lovelace',
  email: 'ada@analytical-engines.org',
  role: 'Instructor',
  organisation: 'Analytical Engines',
  bio: 'Wrote the first program, and argued with Babbage about what it meant.',
  listed: true,
};

/** A long name and a long organisation: the states that break a card are the ones that overflow it. */
export const OVERFLOWING: MemberDraft = {
  fullName: 'Augusta Ada King-Noel, Countess of Lovelace',
  email: 'augusta.ada.king.noel@analytical-engines-and-difference-machines.example.org',
  role: 'Coordinator',
  organisation: 'Analytical Engines & Difference Machines, Marylebone Branch',
  bio: 'A long line, because a card that only looks right with short values is a card that looks wrong.',
  listed: false,
};
