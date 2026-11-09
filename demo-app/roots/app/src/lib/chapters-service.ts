// The chapters' data, for the chapter pages and for My club.
//
// WRITTEN THE WAY THE REST OF AN APP USUALLY IS: a service with a few async functions, no port, no
// source, no subscription. The chapter pages call it from effects and keep the answers in `useState`.
// That is deliberate — those two pages are the part of this app nobody has moved into a region yet,
// and they stand for what every adopting app already has a lot of.
//
// It still keeps the vendor in one file, like every data access here, and it still answers the
// sandbox from the seed so the public build has chapters too.
import type { Chapter, ClubEvent, MemberRow } from 'demo-app';
import { CHAPTERS, SEED_MEMBERS } from 'demo-app';
import { appClient, appPorts, IN_BROWSER_DATA } from './app-data.js';

type ChapterDbRow = { name: string; slug: string; tagline: string; meets: string; venue: string; lead_id: string | null };

const fromDb = (r: ChapterDbRow): Chapter => ({ name: r.name, slug: r.slug, tagline: r.tagline, meets: r.meets, venue: r.venue, leadId: r.lead_id ?? '' });

/** Every chapter, in the order the club lists them. */
export async function fetchChapters(): Promise<Chapter[]> {
  if (IN_BROWSER_DATA) return CHAPTERS;
  // Eight rows, and the club does not grow a chapter without a migration — but bounded anyway.
  const { data, error } = await appClient().from('chapters').select('name,slug,tagline,meets,venue,lead_id').order('name').limit(100);
  if (error) throw new Error(`chapters query failed: ${error.message}`);
  const rows = (data ?? []) as ChapterDbRow[];
  // The club's own order (biggest first, as the seed lists them), not the alphabet.
  const order = new Map(CHAPTERS.map((c, i) => [c.name, i]));
  return rows.map(fromDb).sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

/** One chapter by its URL segment, or null when there is no such chapter. */
export async function fetchChapter(slug: string): Promise<Chapter | null> {
  if (IN_BROWSER_DATA) return CHAPTERS.find((c) => c.slug === slug) ?? null;
  const { data, error } = await appClient().from('chapters').select('name,slug,tagline,meets,venue,lead_id').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`chapter lookup failed: ${error.message}`);
  return data ? fromDb(data as ChapterDbRow) : null;
}

/** Every member, once — the chapter pages count and list them per chapter. */
export async function fetchAllMembers(): Promise<MemberRow[]> {
  if (IN_BROWSER_DATA) return SEED_MEMBERS;
  const { rows } = await appPorts().members.search({}, 0, 100_000);
  return rows;
}

/** Upcoming events, every chapter's — the pages pick out their own. */
export async function fetchUpcomingEvents(): Promise<ClubEvent[]> {
  return appPorts().events.upcoming(new Date().toISOString());
}
