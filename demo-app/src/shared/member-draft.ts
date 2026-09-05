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

/**
 * A directory row in the shape the CARD already speaks.
 *
 * WHY A MAPPER RATHER THAN A SECOND CARD. The members table and the MemberCard design were written
 * against each other — `plan` is the card's `tier`, `member_no` its `memberNo` — but they are not
 * the same words, and the profile page wants the card the users page already has. Twelve lines here
 * buys the island unchanged in a second region; a `ProfileCard` that duplicated the design would be
 * a second artefact to keep in step, and the one that drifts is always the one nobody renders.
 *
 * Rows are PROBED rather than destructured, for the reason the directory probes them: the backend
 * hands back loosely typed rows and a profile that throws on a missing column is worse than one
 * that shows a dash.
 */
export function draftFromMember(row: Record<string, unknown> | undefined): MemberDraft {
  if (!row) return {};
  const str = (key: string): string | undefined => {
    const v = row[key];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
    return undefined;
  };
  const name = [str('firstname'), str('surname')].filter(Boolean).join(' ');
  return {
    ...(name ? { fullName: name } : {}),
    ...(str('email') ? { email: str('email') } : {}),
    ...(str('chapter') ? { chapter: str('chapter') } : {}),
    // `plan` is the column; `tier` is the design's word. Anything that is not "standard" reads as
    // premium, which is the card's own default and keeps an unexpected value from rendering blank.
    tier: str('plan') === 'standard' ? 'standard' : 'premium',
    ...(str('member_no') ? { memberNo: str('member_no') } : {}),
    // The table stores a DATE (`2025-10-27`); the design writes dd/mm/yyyy. Converting here rather
    // than in the card keeps the card ignorant of what a database looks like.
    ...(str('joined') ? { joined: ddmmyyyy(str('joined')!) } : {}),
    ...(str('photo') ? { photo: str('photo') } : {}),
  };
}

/**
 * `2025-10-27` -> `27/10/2025`. Anything else is passed through rather than mangled.
 *
 * EXPORTED because the hero needs it too. It was private, and the profile page then showed the
 * joined date in two formats a few hundred pixels apart — the card's `03/06/2025` beside the hero's
 * raw `2025-06-03`. Nothing failed; it just looked like two applications. One date, one function.
 */
export function ddmmyyyy(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date;
}
