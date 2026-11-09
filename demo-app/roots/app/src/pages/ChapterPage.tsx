// One chapter — PLAIN REACT, NO MOTU, like the list beside it.
//
// It draws its own member table rather than reusing the directory's `x-member-results` island, which
// is exactly what an existing app does: a second, smaller table written for this page, sorted its own
// way, that nobody has reconciled with the first. It is the obvious candidate when this page's turn
// comes — and the reason a survey comes before islands, because "make it the same island" is a
// decision about two pages, not one.
import { useEffect, useMemo, useState } from 'react';
import {
  chapterColor,
  clubOverview,
  grouped,
  initials,
  rankOf,
  statsOf,
  todayIso,
  type Chapter,
  type ClubEvent,
  type ClubOverview,
  type MemberRow,
} from 'demo-app';
import { fetchAllMembers, fetchChapter, fetchUpcomingEvents } from '../lib/chapters-service.js';
import { navigate } from '../lib/routing.js';
import { DateLabel } from './chapter-bits.js';

const PAGE = 12;

export function ChapterPage({ slug }: { slug: string }) {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [showAll, setShowAll] = useState(false);
  const asOf = todayIso();

  useEffect(() => {
    let live = true;
    setStatus('loading');
    Promise.all([fetchChapter(slug), fetchAllMembers(), fetchUpcomingEvents()])
      .then(([c, m, e]) => {
        if (!live) return;
        setChapter(c);
        setMembers(m);
        setEvents(e);
        setOverview(clubOverview(m, asOf));
        setStatus(c ? 'ready' : 'missing');
      })
      .catch((err: unknown) => {
        console.error('chapter page failed', err);
        if (live) setStatus('failed');
      });
    return () => {
      live = false;
    };
  }, [slug, asOf]);

  // Strongest first: this page's own ranking, by the club's own XP rule.
  const people = useMemo(
    () =>
      members
        .filter((m) => chapter && m.chapter === chapter.name)
        .map((m) => ({ m, s: statsOf(m, asOf) }))
        .sort((a, b) => b.s.xp - a.s.xp),
    [members, chapter, asOf],
  );

  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(path);
  };

  if (status === 'missing' || status === 'failed') {
    return (
      <div className="cl-page cl-scope">
        <div className="cl-page__state">
          <h1 className="cl-lg">{status === 'missing' ? 'No such chapter' : 'The chapter is not answering'}</h1>
          <p>{status === 'missing' ? 'That link does not point at one of the club’s chapters.' : 'It could not be loaded. Check that the local database is running.'}</p>
          <a href="/chapters" onClick={go('/chapters')}>
            All chapters
          </a>
        </div>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="cl-page cl-scope" aria-busy="true">
        <div className="cl-chaphead cl-chapcard--skel" />
      </div>
    );
  }

  const color = chapterColor(chapter.name);
  const place = overview ? overview.cup.findIndex((c) => c.chapter === chapter.name) : -1;
  const premium = people.filter(({ m }) => m.plan === 'premium').length;
  const streaks = people.filter(({ s }) => s.streak > 0).length;
  const lead = members.find((m) => m.id === chapter.leadId);
  const upcoming = events.filter((e) => e.chapter === chapter.name);
  const shown = showAll ? people : people.slice(0, PAGE);

  return (
    <div className="cl-page cl-scope">
      <header className="cl-chaphead cl-block" style={{ background: color }}>
        <a className="cl-btn cl-lg cl-ph__back" href="/chapters" onClick={go('/chapters')}>
          &lsaquo; Chapters
        </a>
        <h1 className="cl-lg">{chapter.name}</h1>
        <p className="cl-chaphead__tag">{chapter.tagline}</p>
        <p className="cl-chaphead__meets">
          {chapter.meets} · {chapter.venue}
        </p>
      </header>

      <div className="cl-tiles">
        <div className="cl-tile cl-tile--ox cl-block">
          <span className="cl-lg cl-tile__n">{people.length}</span>
          <span className="cl-tile__label">Members</span>
        </div>
        <div className="cl-tile cl-tile--gold cl-block">
          <span className="cl-lg cl-tile__n">{premium}</span>
          <span className="cl-tile__label">Premium</span>
        </div>
        <div className="cl-tile cl-tile--orange cl-block">
          <span className="cl-lg cl-tile__n">{streaks}</span>
          <span className="cl-tile__label">Active streaks</span>
        </div>
        <div className="cl-tile cl-tile--navy cl-block">
          <span className="cl-lg cl-tile__n">{place >= 0 ? `#${place + 1}` : '—'}</span>
          <span className="cl-tile__label">
            Chapter Cup
            <br />
            {place >= 0 && overview ? `${grouped(overview.cup[place]!.points)} season pts` : ''}
          </span>
        </div>
      </div>

      <div className="cl-chapbody">
        <section className="cl-card cl-chapbody__main" aria-label="Members of this chapter">
          <div className="cl-chaptable__head cl-lg">
            <span>Member</span>
            <span>Level</span>
            <span className="cl-chaptable__plan">Plan</span>
          </div>
          <ol className="cl-chaptable">
            {shown.map(({ m, s }, i) => (
              <li key={String(m.id)} className={`cl-chaptable__row${i % 2 ? ' cl-chaptable__row--odd' : ''}`}>
                <a className="cl-chaptable__who" href={`/member/${m.id}`} onClick={go(`/member/${m.id}`)}>
                  <span className="cl-ava">{initials(String(m.firstname), String(m.surname))}</span>
                  <span>
                    <strong>{`${m.firstname} ${m.surname}`}</strong>
                    {m.id === chapter.leadId ? <em className="cl-chaptable__lead">Lead</em> : null}
                    {m.status === 'suspended' ? <em className="cl-chaptable__sus">Suspended</em> : null}
                  </span>
                </a>
                <span className="cl-chaptable__lv">
                  <span className="cl-lg">Lv {s.level}</span> <small>{rankOf(s.level)}</small>
                </span>
                <span className="cl-chaptable__plan">
                  <span className={`cl-lg cl-pill cl-pill--${m.plan === 'premium' ? 'premium' : 'standard'}`}>{m.plan === 'premium' ? 'Premium' : 'Standard'}</span>
                </span>
              </li>
            ))}
          </ol>
          {people.length > PAGE ? (
            <div className="cl-pages">
              <span>
                Showing <strong>{shown.length}</strong> of {people.length}
              </span>
              <button type="button" className="cl-pages__step" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : 'Show everyone'}
              </button>
            </div>
          ) : null}
        </section>

        <aside className="cl-chapbody__aside">
          <section className="cl-panel cl-block cl-mine" aria-label="Coming up">
            <div className="cl-panel__top">
              <h2 className="cl-lg">Coming up</h2>
              <a className="cl-mine__browse" href="/events" onClick={go('/events')}>
                All events &rsaquo;
              </a>
            </div>
            {upcoming.length === 0 ? (
              <p className="cl-empty">Nothing planned yet.</p>
            ) : (
              <ul className="cl-chapevents">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <strong>{e.title}</strong>
                    <span>
                      <DateLabel iso={e.startsAt} withTime /> · {e.going}/{e.capacity} going
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {lead ? (
            <section className="cl-panel cl-block cl-chaplead" aria-label="Chapter lead">
              <span className="cl-label">Chapter lead</span>
              <a className="cl-chaptable__who" href={`/member/${lead.id}`} onClick={go(`/member/${lead.id}`)}>
                <span className="cl-ava" style={{ background: color, color: '#FBF3E2' }}>
                  {initials(String(lead.firstname), String(lead.surname))}
                </span>
                <span>
                  <strong>{`${lead.firstname} ${lead.surname}`}</strong>
                  <small>Member since {String(lead.joined).slice(0, 4)}</small>
                </span>
              </a>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
