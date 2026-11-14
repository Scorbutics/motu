// The profile page.
//
// NOTICE HOW LITTLE IS HERE, and notice what the little that IS here consists of. The page resolves
// a member id from the URL, asks the application's own two sources for a member and a calendar, and
// feeds those into the region as host-fed keys. It does not group slots into days, does not decide
// which day opens first, does not hold the chosen day and does not hold the chosen slot — the last
// two are owned by islands that DO NOT EXIST YET, and the page could not keep a `useState` of them
// even if it wanted to: the region's host-side type omits a produced key, so assigning one is a
// compile error and `integrate check` fails a page that shadows one anyway.
//
// That is the property worth watching while the calendar gets built: the page below does not change.
import { useEffect, useState } from 'react';
import type { Calendar, MemberRow } from 'demo-app';
import { emptyCalendar, todayIso } from 'demo-app';
import { Profile } from '../motu/profile-region.js';
import { appSources } from '../lib/app-data.js';

/** What the screen is doing right now. `missing` is a real state: someone pasted a bad id. */
type Load = 'loading' | 'ready' | 'missing' | 'failed';

/**
 * The member and their calendar, fetched together.
 *
 * ONE EFFECT, TWO REQUESTS, AND A GENERATION GUARD. Clicking through the directory quickly starts
 * several of these, and without the guard the SLOWER answer wins — so a profile shows the member you
 * asked for two clicks ago. Nothing on screen says it happened, which is why it is worth the six
 * lines rather than a comment saying "should be fine".
 */
function useProfileData(memberId: string): { member: MemberRow | null; calendar: Calendar; state: Load } {
  const [member, setMember] = useState<MemberRow | null>(null);
  const [calendar, setCalendar] = useState<Calendar>(() => emptyCalendar());
  const [state, setState] = useState<Load>('loading');

  useEffect(() => {
    let live = true;
    setState('loading');
    const { members, availability } = appSources();
    // BOTH AT ONCE. The calendar does not depend on the member row — it is keyed by the same id — so
    // waiting for one before asking for the other would double the time the page spends empty.
    Promise.all([members.byId(memberId), availability.calendar(memberId)])
      .then(([row, cal]) => {
        if (!live) return;
        setMember(row);
        setCalendar(cal);
        // A missing member is NOT a failure. The port answers `null` for "no such row" and throws for
        // "the database refused", precisely so this line can tell them apart and the screen can say
        // the right one.
        setState(row ? 'ready' : 'missing');
      })
      .catch((err: unknown) => {
        if (!live) return;
        console.error('profile load failed', err);
        setState('failed');
      });
    return () => {
      live = false;
    };
  }, [memberId]);

  return { member, calendar, state };
}

/** The screen, inside the provider — it reads the region, so it cannot be the thing that renders it. */
function ProfileScreen({ memberId }: { memberId: string }) {
  const { member, calendar, state } = useProfileData(memberId);

  // FEED THE HOST-FED KEYS, and only those. `provide` will not compile for `selectedDay` or
  // `selectedSlot`: those belong to the calendar islands, and the page having no way to write them
  // is the point rather than an inconvenience.
  useEffect(() => {
    Profile.provide('member', member);
    Profile.provide('calendar', calendar);
    // The day the hero's level and streak are computed for — the directory uses the same one.
    Profile.provide('asOf', todayIso());
  }, [member, calendar]);

  if (state === 'missing') {
    return (
      <div className="cl-page cl-page__state">
        <h1 className="cl-lg">No such member</h1>
        <p>That profile link does not point at anyone in the directory.</p>
        <a href="/">
          Back to the directory
        </a>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div className="cl-page cl-page__state">
        <h1 className="cl-lg">The directory is not answering</h1>
        <p>The member could not be loaded. Check that the local database is running.</p>
        <a href="/">
          Back to the directory
        </a>
      </div>
    );
  }

  return (
    // THE SKIN IS DECLARED BY THE HOST, and it has to be said here — the island stylesheet defines
    // its tokens on `:where(:host, .motu-root)`, a marker the custom-element path adds for you and
    // the React path does not. Without it no token resolves and the gradients collapse to
    // transparent: invisible, and identical in the lagoon, which is how it survives.
    <div className="cl-page cl-scope">
      {/*
        STAGE-ONE ADOPTION, like every other page in this app: the islands are placed inside the
        page's own JSX rather than through `<Profile.Root>`. The archipelago's `layout` is what the
        LAGOON renders, so the preview and the page are two descriptions of one arrangement — which
        is the cost of this stage and the reason `region-root` reports it without failing on it. The
        region earns the move to `root` when someone is already editing this page.

        THE SAME TWO COLUMNS AS THE ARCHIPELAGO'S `layout`: the calendar (days over slots) on the
        wider side, the summary that confirms the choice beside it.
      */}
      <Profile.Island slot="profile-hero" props={{ loading: state === 'loading' }} />
      {/*
        NO MEMBER CARD HERE ANY MORE. The header above is drawn in the card's design, and a card
        beside it repeated the same name, email, number and date — one row rendered twice.
      */}
      <div className="app__profile">
        <div className="app__profile-col">
          <Profile.Island slot="calendar-days" props={{ loading: state === 'loading' }} />
          <Profile.Island slot="calendar-slots" />
        </div>
        <div className="app__profile-col">
          <Profile.Island slot="booking-summary" />
        </div>
      </div>
      <ProfileFooter />
    </div>
  );
}

/** Reads the region back, so the page proves it can — and so there is something to look at. */
function ProfileFooter() {
  const region = Profile.useRegion();
  const day = typeof region.selectedDay === 'string' ? region.selectedDay : null;
  return (
    <footer className="cl-page__foot">
      {day ? `Looking at ${day}` : 'No day picked yet'}
    </footer>
  );
}

export function ProfilePage({ memberId }: { memberId: string }) {
  return (
    <Profile.Region>
      <ProfileScreen memberId={memberId} />
    </Profile.Region>
  );
}
