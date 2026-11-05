// The drafts BOTH sides show, in one module they each import.
//
// Evidence files are read by plain node, where the app's `@/…` alias does not resolve, so this module
// deliberately has no application imports beyond a TYPE — which erases. A renamed field then fails the
// build here rather than quietly previewing last month's shape.
//
// The PEOPLE are invented, and honestly so: this is the add-a-member page, and a member being created is
// by definition someone the seed does not have yet. What they are not allowed to break is the club's
// rules — so their numbers come AFTER the seed's last (702739; numbers are unique, and these used to
// reuse Rich Stroustrup's and three others'), their addresses are on the club's `@example.org`, their
// joining dates are in the past, and the photo is drawn here rather than fetched from a third party.
import type { MemberDraft } from './member-draft.js';

/** A portrait drawn inline — a head and shoulders on the club's teal — so no scenario reaches the network. */
const PORTRAIT =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2F5753"/>' +
      '<circle cx="32" cy="25" r="11" fill="#D3B265"/><path d="M12 64c2-14 10-21 20-21s18 7 20 21z" fill="#D3B265"/></svg>',
  );

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
  email: 'ada.lovelace@example.org',
  chapter: 'North chapter',
  tier: 'premium',
  memberNo: '702740',
  joined: '12/03/2026',
};

/** The canvas's "Standard" state — the quiet stripe, the muted badge. */
export const STANDARD: MemberDraft = {
  fullName: 'Grace Hopper',
  email: 'grace.hopper@example.org',
  chapter: 'South chapter',
  tier: 'standard',
  memberNo: '702741',
  joined: '04/07/2026',
};

/** The canvas's "With photo": the avatar falls back to initials only when this is absent. */
export const WITH_PHOTO: MemberDraft = {
  fullName: 'Alan Turing',
  email: 'alan.turing@example.org',
  chapter: 'East chapter',
  tier: 'premium',
  memberNo: '702742',
  joined: '01/08/2026',
  photo: PORTRAIT,
};

/**
 * The canvas's "Long name & email (truncation)".
 *
 * The state that catches layout bugs, and the reason the design lists it: a card that only looks
 * right with short values is a card that looks wrong.
 */
export const OVERFLOWING: MemberDraft = {
  fullName: 'Maria Guadalupe Fernández de la Cruz',
  email: 'maria.guadalupe.fernandez.de.la.cruz@chapters.example.org',
  chapter: 'Northwest coastal chapter',
  tier: 'standard',
  memberNo: '702743',
  joined: '22/08/2026',
};
