// THE VOCABULARY BOTH ISLANDS SPEAK, and the only thing they share.
//
// The form OWNS this shape and publishes it; the card READS it and draws it. Neither imports the
// other — a form that knew about a card, or a card that knew which form filled it, is the coupling
// motu exists to keep out of components and in the region's declaration instead.
//
// Every field optional, because the card must render from DEFAULTS ALONE: the first thing anyone sees
// in the lagoon is an empty draft, and that is a state worth designing rather than an accident.

/** What a member can be, in this demo's vocabulary. Mirrors the roles the legacy Users page used. */
export const MEMBER_ROLES = ['Member', 'Volunteer', 'Instructor', 'Coordinator', 'Staff'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface MemberDraft {
  fullName?: string;
  email?: string;
  role?: MemberRole;
  organisation?: string;
  /** A short line the member writes about themselves; the card renders it as a quote. */
  bio?: string;
  /** Opt-in to the member directory. The card says so, because it changes what the profile IS. */
  listed?: boolean;
}

/** Initials for the avatar: two letters at most, from the words of the name. */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.length === 1
    ? words[0]!.slice(0, 2).toUpperCase()
    : (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * How complete the draft is, 0..1 — the card shows it as a ring around the avatar.
 *
 * Counted over the fields a PERSON would consider part of a profile, so `listed` (a preference) is
 * deliberately not one of them: ticking a checkbox should not look like filling in your name.
 */
export function completenessOf(draft: MemberDraft | undefined): number {
  const fields = [draft?.fullName, draft?.email, draft?.role, draft?.organisation, draft?.bio];
  const filled = fields.filter((v) => typeof v === 'string' && v.trim() !== '').length;
  return filled / fields.length;
}
