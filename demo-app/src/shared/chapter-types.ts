// The club's chapters: the eight local groups every member already belongs to.
//
// `members.chapter` has always held one of these eight names; until now nothing said anything ABOUT a
// chapter — where it meets, who leads it, since when. These rows are that, and they are the one
// description of it: `supabase/seeds/chapters.sql` is generated from this list
// (`pnpm --filter @demo-app/app seed:club`), the sandbox answers from it, and a test fails when the
// committed SQL and this file disagree.
//
// No motu and no vendor import: the plain-React chapter pages and the regions both read it.

/** One chapter, as the `chapters` table holds it. */
export interface Chapter {
  /** The name members carry in `members.chapter` — the join key, so it is spelled exactly as there. */
  name: string;
  /** The URL segment: `/chapters/<slug>`. */
  slug: string;
  /** One sentence a newcomer reads to decide whether this is their chapter. */
  tagline: string;
  /** When it gathers, in words. Not a schedule: the events table is the schedule. */
  meets: string;
  /** Where it usually gathers. */
  venue: string;
  /** The member who leads it (`members.id`). */
  leadId: string;
}

/** A member id from a membership number — the same derivation `seed.sql` and the sandbox use. */
export const memberIdOf = (memberNo: string | number) => `00000000-0000-4000-8000-${String(memberNo).padStart(12, '0')}`;

/**
 * The eight chapters. Each lead is the chapter's longest-standing ACTIVE member in the seed — someone
 * a person can click through to, not a name written for this file.
 */
export const CHAPTERS: Chapter[] = [
  {
    name: 'North chapter',
    slug: 'north',
    tagline: 'The biggest chapter, and the one that never cancels for weather.',
    meets: 'Every other Tuesday, 19:00',
    venue: 'Upper room, North Street library',
    leadId: memberIdOf('702598'),
  },
  {
    name: 'East chapter',
    slug: 'east',
    tagline: 'Workshops first, small talk after. Bring a laptop.',
    meets: 'Wednesdays, 18:30',
    venue: 'East market hall, mezzanine',
    leadId: memberIdOf('702633'),
  },
  {
    name: 'Old town chapter',
    slug: 'old-town',
    tagline: 'Long tables, long evenings, and the best-kept minutes in the club.',
    meets: 'First Thursday of the month, 19:30',
    venue: 'The cellar, Old Town brewing society',
    leadId: memberIdOf('702528'),
  },
  {
    name: 'Harbour chapter',
    slug: 'harbour',
    tagline: 'Meets by the water and walks the quay when it does not rain.',
    meets: 'Mondays, 18:00',
    venue: 'Harbour light cooperative, net loft',
    leadId: memberIdOf('702584'),
  },
  {
    name: 'Northwest coastal chapter',
    slug: 'northwest-coastal',
    tagline: 'Spread along the coast road, so half its meetings happen online.',
    meets: 'Thursdays, 19:00 (online every other week)',
    venue: 'Coastguard station, lookout room',
    leadId: memberIdOf('702507'),
  },
  {
    name: 'West chapter',
    slug: 'west',
    tagline: 'Small on purpose: everyone knows everyone by the second visit.',
    meets: 'Fridays, 18:00',
    venue: 'West park pavilion',
    leadId: memberIdOf('702667'),
  },
  {
    name: 'South chapter',
    slug: 'south',
    tagline: 'Runs the club picnic every summer and will tell you about it.',
    meets: 'Saturdays, 10:00',
    venue: 'South community garden, greenhouse',
    leadId: memberIdOf('702630'),
  },
  {
    name: 'University chapter',
    slug: 'university',
    tagline: 'The youngest chapter, with a reading list longer than its history.',
    meets: 'Tuesdays in term time, 17:30',
    venue: 'Seminar room 4, the old library',
    leadId: memberIdOf('702516'),
  },
];

export function chapterBySlug(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}

export function chapterByName(name: string | null | undefined): Chapter | undefined {
  return name ? CHAPTERS.find((c) => c.name === name) : undefined;
}
