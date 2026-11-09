// My club — the page a member lands on.
//
// The page feeds four host-fed keys — who you are, the day, the club's game state and the chapters —
// and places five islands, two of them borrowed unchanged from the directory. Your events come from
// the events source, installed by the binding; cancelling one is answered there too.
import { useEffect, useRef, useState } from 'react';
import { todayIso, type Chapter, type MemberRow } from 'demo-app';
import { Home } from '../motu/home-region.js';
import { useClubOverview } from '../lib/club-overview.js';
import { fetchChapters } from '../lib/chapters-service.js';

function HomeFeed({ me }: { me: MemberRow | null | undefined }) {
  const asOf = todayIso();
  const overview = useClubOverview(asOf);
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchChapters()
      .then((c) => live && setChapters(c))
      .catch((err: unknown) => console.error('chapters failed', err));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (me !== undefined) Home.provide('me', me);
  }, [me]);
  useEffect(() => {
    Home.provide('asOf', asOf);
  }, [asOf]);
  useEffect(() => {
    if (overview) Home.provide('overview', overview);
  }, [overview]);
  useEffect(() => {
    if (chapters) Home.provide('chapters', chapters);
  }, [chapters]);
  return null;
}

/**
 * Says out loud what a cancellation did. A sighted member sees the row leave the list; a screen reader
 * hears nothing unless the page says so — read back from the region, so it is the SOURCE's answer that
 * is announced, not the button press.
 */
function RsvpAnnouncer() {
  const { myRsvps, eventsLoading } = Home.useRegion();
  const count = Array.isArray(myRsvps) ? myRsvps.length : null;
  const last = useRef<number | null>(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    if (eventsLoading || count === null) return;
    if (last.current !== null && count !== last.current) {
      setSaid(`You're going to ${count} event${count === 1 ? '' : 's'}.`);
    }
    last.current = count;
  }, [count, eventsLoading]);
  return (
    <p className="cl-sr" aria-live="polite">
      {said}
    </p>
  );
}

export function HomePage({ me }: { me: MemberRow | null | undefined }) {
  return (
    <Home.Region>
      <HomeFeed me={me} />
      <RsvpAnnouncer />
      <div className="cl-home cl-scope motu-root" data-motu-theme="motu">
        <Home.Island slot="my-standing" />
        <div className="cl-home__body">
          <div className="cl-home__main">
            <Home.Island slot="my-events" />
            <Home.Island slot="my-chapter" />
          </div>
          <aside className="cl-home__aside">
            <Home.Island slot="home-quest" />
            <Home.Island slot="home-cup" />
          </aside>
        </div>
      </div>
    </Home.Region>
  );
}
