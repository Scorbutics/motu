// THE VOCABULARY BOTH ISLANDS SPEAK, and the only thing they share.
//
// Taken from the MemberCard design canvas: tier, chapter, member number, joined date, photo. The form
// OWNS this shape and publishes it; the card READS it and draws it. Neither imports the other — a
// form that knew about a card, or a card that knew which form filled it, is the coupling motu exists
// to keep out of components and in the region's declaration instead.
//
// Every field optional, because the card must render from DEFAULTS ALONE: the first thing anyone sees
// is an empty draft, and that is a state worth designing rather than an accident.

/** Membership tier. `premium` is the design's default and the one with the gold treatment. */
export const MEMBER_TIERS = ['premium', 'standard'] as const;
export type MemberTier = (typeof MEMBER_TIERS)[number];

export interface MemberDraft {
  fullName?: string;
  email?: string;
  /** The chapter they belong to — "South chapter", "Northwest coastal chapter". */
  chapter?: string;
  tier?: MemberTier;
  /** Membership number. Six digits in the design's examples. */
  memberNo?: string;
  /** Joined date, as the design writes it: dd/mm/yyyy. */
  joined?: string;
  /** Avatar URL. Absent falls back to initials, which is the design's default state. */
  photo?: string;
}

/** Initials for the avatar fallback: two letters at most, from the words of the name. */
export function initialsOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.length === 1
    ? words[0]!.slice(0, 2).toUpperCase()
    : (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

/**
 * How complete the profile is, 0..1 — the card shows it as a bar in the footer.
 *
 * Counted over the fields a PERSON fills in, so `memberNo` and `joined` are deliberately excluded:
 * they are assigned rather than typed, and counting them would make a blank form look half done.
 */
export function completenessOf(draft: MemberDraft | undefined): number {
  const fields = [draft?.fullName, draft?.email, draft?.chapter, draft?.tier, draft?.photo];
  const filled = fields.filter((v) => typeof v === 'string' && v.trim() !== '').length;
  return filled / fields.length;
}
