// The Supabase adapter — the few lines that turn a PostgREST answer into what the source expects.
//
// THIS IS THE UNPROVEN INCH, and it is worth naming rather than hiding. Every check in this project
// runs against the source over a port; none of them can tell you that `.ilike('email', …)` is the
// filter this app wants, or that `count: 'exact'` is the number the pager needs. The mitigation is
// that it is SHORT by construction: everything that could be reasoned about lives in
// `membersSource`, and what is left here is the vendor's shape.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MemberCriteria, MemberOrder } from 'demo-app';
import { orderMembers } from 'demo-app';
import type { MembersPort, MembersQueryResult } from 'demo-app';
import type { AvailabilityPort, TimeslotRow } from 'demo-app';
import type { ClubEvent, EventsPort } from 'demo-app';

/** Substring filters: what a person types into a search box is a fragment, not an identifier. */
const CONTAINS: (keyof MemberCriteria)[] = ['email', 'firstname', 'surname'];
/** Exact filters: these are enum codes chosen from chips, so a substring match would be wrong. */
const EXACT: (keyof MemberCriteria)[] = ['status', 'plan'];

export function supabaseMembersPort(client: SupabaseClient): MembersPort {
  return {
    async search(criteria: MemberCriteria, first: number, perPage: number, order?: MemberOrder): Promise<MembersQueryResult> {
      let q = client.from('members').select('*', { count: 'exact' });
      for (const key of CONTAINS) {
        const value = criteria[key];
        if (typeof value === 'string' && value.trim() !== '') q = q.ilike(key, `%${value.trim()}%`);
      }
      for (const key of EXACT) {
        const value = criteria[key];
        if (typeof value === 'string' && value !== '') q = q.eq(key, value);
      }
      // Name OR email. PostgREST's `or` takes a filter list in its own syntax, where `,` `(` `)` and
      // `%`-wildcards are structure — so the term is stripped of them rather than trusted to be safe.
      // A full name ("grace allen") is split: every word must hit one of the three columns.
      const term = typeof criteria.q === 'string' ? criteria.q.trim() : '';
      if (term !== '') {
        for (const word of term.split(/\s+/)) {
          const w = word.replace(/[,()%*\\]/g, '');
          if (w) q = q.or(`firstname.ilike.%${w}%,surname.ilike.%${w}%,email.ilike.%${w}%`);
        }
      }
      // `range` is inclusive at both ends, which is the off-by-one this line exists to get right
      // once: asking for rows 0..20 returns twenty-ONE members and the pager then disagrees with
      // itself about how many pages there are.
      // LEVEL AND STREAK ARE NOT COLUMNS. They are the club's rules over each row (`gamification.ts`),
      // so the database cannot order by them: fetch every matching row and let the same function the
      // sandbox uses order and page them. The stored columns sort here, in Postgres, as before.
      if (order && (order.key === 'level' || order.key === 'streak')) {
        const { data, error } = await q;
        if (error) throw new Error(`members query failed: ${error.message}`);
        const all = orderMembers(data ?? [], order);
        return { rows: all.slice(first, first + perPage), total: all.length };
      }
      const asc = order?.dir !== 'desc';
      const column = order && order.key !== 'name' ? order.key : null;
      if (column) q = q.order(column, { ascending: asc });
      q = q.order('surname', { ascending: column ? true : asc }).order('firstname', { ascending: column ? true : asc });
      const { data, error, count } = await q.range(first, first + perPage - 1);
      // THROW, don't return an empty page. "No members" and "the database refused" look identical
      // on screen, and the results island already has a designed error state for the second one.
      if (error) throw new Error(`members query failed: ${error.message}`);
      return { rows: data ?? [], total: count ?? 0 };
    },
    async byId(id: string) {
      // `maybeSingle`, NOT `single`. `single` makes "no rows" an ERROR, which would collapse the two
      // outcomes the port exists to keep apart — a mistyped profile URL and a database that refused
      // would arrive here as the same thing.
      const { data, error } = await client.from('members').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`member lookup failed: ${error.message}`);
      return data ?? null;
    },
  };
}

/**
 * The client the app talks to Postgres through.
 *
 * `persistSession: false` because this club has no login: every visitor is `anon`. The anon key may
 * read everything and write exactly one table, `event_rsvps` — the RLS policies decide that, not this
 * file (see the events migration for why that write is open to anyone).
 */
export function membersClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * The profile calendar's backend: a member's slots from an instant onward, in time order.
 *
 * SAME UNPROVEN INCH as the ports above, and the same mitigation — it is short. Everything the
 * calendar actually decides (grouping into days, counting free against taken, which day opens
 * first, the horizon) is in `availabilitySource`, where a unit test drives it over a hand-made port.
 * What is left here is the vendor's shape, and the one thing no check in this project can tell you
 * is that `gte('starts_at', …)` is the filter this app wants.
 */
export function supabaseAvailabilityPort(client: SupabaseClient): AvailabilityPort {
  return {
    async forMember(memberId: string, fromISO: string): Promise<TimeslotRow[]> {
      const { data, error } = await client
        .from('timeslots')
        .select('id,starts_at,minutes,kind,taken')
        .eq('member_id', memberId)
        // Inclusive: a slot starting exactly at midnight belongs to today, and `gt` would drop it.
        .gte('starts_at', fromISO)
        .order('starts_at')
        // A ceiling rather than a page. The source clamps to a HORIZON IN DAYS and cannot know how
        // many rows that is, so the query asks for more than any plausible fortnight holds and lets
        // the source do the clamping it can actually reason about.
        .limit(400);
      // THROW, don't return an empty list. "This member publishes no availability" is a designed
      // screen with its own copy; "the database refused" is a different one, and returning [] here
      // would render the first while meaning the second.
      if (error) throw new Error(`availability query failed: ${error.message}`);
      return (data ?? []) as TimeslotRow[];
    },
  };
}

/**
 * The events backend. SAME UNPROVEN INCH, same mitigation: what is decided lives in `eventsSource`
 * and in the database's guard trigger; this file is the vendor's shape. Two things here no check in
 * this project can confirm, so they are named: the embed `members!events_host_id_fkey` (the FK's
 * default name in the migration), and `event_rsvps(count)` coming back as `[{ count }]`.
 */
type EventDbRow = {
  id: string;
  title: string;
  kind: ClubEvent['kind'];
  chapter: string | null;
  starts_at: string;
  minutes: number;
  venue: string;
  capacity: number;
  blurb: string;
  host: { id: string; firstname: string; surname: string } | null;
  event_rsvps: { count: number }[];
};

export function supabaseEventsPort(client: SupabaseClient): EventsPort {
  return {
    async upcoming(fromIso) {
      const { data, error } = await client
        .from('events')
        .select('id,title,kind,chapter,starts_at,minutes,venue,capacity,blurb,host:members!events_host_id_fkey(id,firstname,surname),event_rsvps(count)')
        .gte('starts_at', fromIso)
        .order('starts_at')
        // A ceiling, not a page: the club plans weeks ahead, not years. 200 is far past any season.
        .limit(200);
      if (error) throw new Error(`events query failed: ${error.message}`);
      return ((data ?? []) as unknown as EventDbRow[]).map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        chapter: r.chapter,
        startsAt: new Date(r.starts_at).toISOString(),
        minutes: r.minutes,
        venue: r.venue,
        capacity: r.capacity,
        going: r.event_rsvps?.[0]?.count ?? 0,
        host: r.host ? { id: r.host.id, name: `${r.host.firstname} ${r.host.surname}` } : null,
        blurb: r.blurb,
      }));
    },
    async rsvpsOf(memberId, fromIso) {
      // Upcoming only, filtered through the embedded event (`!inner` makes the filter drop the RSVP
      // row, not just null the embed). Bounded by the calendar: one row per event.
      const { data, error } = await client
        .from('event_rsvps')
        .select('event_id,events!inner(starts_at)')
        .eq('member_id', memberId)
        .gte('events.starts_at', fromIso)
        .limit(500);
      if (error) throw new Error(`rsvps query failed: ${error.message}`);
      return (data ?? []).map((r: { event_id: string }) => r.event_id);
    },
    async attendees(eventId) {
      // Bounded by the event's capacity (at most 80 in the seed).
      const { data, error } = await client
        .from('event_rsvps')
        .select('member_id,created_at,members(firstname,surname,chapter)')
        .eq('event_id', eventId)
        .order('created_at')
        .order('member_id')
        .limit(500);
      if (error) throw new Error(`attendees query failed: ${error.message}`);
      type Row = { member_id: string; members: { firstname: string; surname: string; chapter: string | null } | null };
      return ((data ?? []) as unknown as Row[]).map((r) => {
        const first = r.members?.firstname ?? '';
        const last = r.members?.surname ?? '';
        return { id: r.member_id, name: `${first} ${last}`.trim(), initials: `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase(), chapter: r.members?.chapter ?? null };
      });
    },
    async rsvp(eventId, memberId) {
      // The guard trigger's refusal arrives as the error MESSAGE (`rsvp_refused:full`); the source
      // maps it. Rethrown with the message intact, or the mapping would see only our prefix.
      const { error } = await client.from('event_rsvps').insert({ event_id: eventId, member_id: memberId });
      if (error) throw new Error(error.message);
    },
    async cancel(eventId, memberId) {
      const { error } = await client.from('event_rsvps').delete().eq('event_id', eventId).eq('member_id', memberId);
      if (error) throw new Error(`cancel failed: ${error.message}`);
    },
  };
}
