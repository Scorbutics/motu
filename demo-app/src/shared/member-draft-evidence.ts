// The drafts BOTH sides show, in one module they each import.
//
// Evidence files are read by plain node, where the app's `@/…` alias does not resolve, so this module
// deliberately has no application imports beyond a TYPE — which erases. A renamed field then fails the
// build here rather than quietly previewing last month's shape.
//
// The values are the design canvas's own: Grace Hopper on standard, Alan Turing with a photo, and the
// long-name row that exists to prove truncation.
import type { MemberDraft } from './member-draft.js';

/** Nothing filled in. The state the card is first seen in, and the one it must be designed for. */
export const EMPTY: MemberDraft = {};

/** Half a profile: enough to draw a name and a tier, not enough to look finished. */
export const PARTIAL: MemberDraft = {
  fullName: 'Ada Lovelace',
  tier: 'premium',
};

/** The canvas's "Premium · default": every field, the gold stripe, initials rather than a photo. */
export const PREMIUM: MemberDraft = {
  fullName: 'Ada Lovelace',
  email: 'ada.lovelace@example.com',
  chapter: 'North chapter',
  tier: 'premium',
  memberNo: '702505',
  joined: '12/03/2026',
};

/** The canvas's "Standard" state — the quiet stripe, the muted badge. */
export const STANDARD: MemberDraft = {
  fullName: 'Grace Hopper',
  email: 'grace.hopper@example.com',
  chapter: 'South chapter',
  tier: 'standard',
  memberNo: '702506',
  joined: '04/07/2026',
};

/** The canvas's "With photo": the avatar falls back to initials only when this is absent. */
export const WITH_PHOTO: MemberDraft = {
  fullName: 'Alan Turing',
  email: 'alan.turing@example.com',
  chapter: 'East chapter',
  tier: 'premium',
  memberNo: '702507',
  joined: '01/09/2026',
  photo: 'https://i.pravatar.cc/152?img=12',
};

/**
 * The canvas's "Long name & email (truncation)".
 *
 * The state that catches layout bugs, and the reason the design lists it: a card that only looks
 * right with short values is a card that looks wrong.
 */
export const OVERFLOWING: MemberDraft = {
  fullName: 'Maria Guadalupe Fernández de la Cruz',
  email: 'maria.guadalupe.fernandez@very-long-company-domain.example',
  chapter: 'Northwest coastal chapter',
  tier: 'standard',
  memberNo: '702508',
  joined: '22/11/2026',
};
