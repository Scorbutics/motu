// The chapters page — PLAIN REACT, NO MOTU.
//
// This is the app's older shape, kept on purpose: three fetches in one effect, the answers in
// `useState`, the arithmetic in the component. It is what most of an existing app looks like on the
// day it adopts motu, and it is the page you would survey first (`/island-locate`) to decide what, if
// anything, here becomes an island. Nothing on it is declared, so nothing on it is checked — which is
// exactly the difference the regions beside it make visible.
import { useEffect, useState } from 'react';
import { chapterColor, clubOverview, todayIso, type Chapter, type ClubEvent, type ClubOverview, type MemberRow } from 'demo-app';
import { fetchAllMembers, fetchChapters, fetchUpcomingEvents } from '../lib/chapters-service.js';
import { navigate } from '../lib/routing.js';
import { DateLabel, MembersIcon } from './chapter-bits.js';

export function ChaptersPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [overview, setOverview] = useState<ClubOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([fetchChapters(), fetchAllMembers(), fetchUpcomingEvents()])
      .then(([c, m, e]) => {
        if (!live) return;
        setChapters(c);
        setMembers(m);
        setEvents(e);
        setOverview(clubOverview(m, todayIso()));
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error('chapters page failed', err);
        if (live) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, []);

  const open = (slug: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(`/chapters/${slug}`);
  };

  if (failed) {
    return (
      <div className="cl-page cl-scope">
        <div className="cl-page__state">
          <h1 className="cl-lg">The chapters are not answering</h1>
          <p>They could not be loaded. Check that the local database is running.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cl-page cl-scope">
      <header className="cl-head">
        <div className="cl-head__title cl-block">
          <MembersIcon />
          <h1 className="cl-lg">Chapters</h1>
          <div className="cl-head__facts">
            {loading ? 'The club, locally' : `${chapters.length} chapters · ${members.length} members`}
            <br />
            <span className="cl-head__pill">Visitors welcome</span>
          </div>
        </div>
      </header>

      <div className="cl-chapters">
        {loading
          ? [0, 1, 2, 3].map((i) => <div key={i} className="cl-chapcard cl-chapcard--skel" aria-hidden="true" />)
          : chapters.map((c) => {
              const people = members.filter((m) => m.chapter === c.name);
              const premium = people.filter((m) => m.plan === 'premium').length;
              const place = overview ? overview.cup.findIndex((x) => x.chapter === c.name) : -1;
              const next = events.find((e) => e.chapter === c.name);
              const lead = members.find((m) => m.id === c.leadId);
              return (
                <a key={c.slug} className="cl-chapcard" href={`/chapters/${c.slug}`} onClick={open(c.slug)}>
                  <span className="cl-chapcard__band" style={{ background: chapterColor(c.name) }}>
                    <span className="cl-lg cl-chapcard__name">{c.name.replace(/ chapter$/, '')}</span>
                    {place >= 0 ? (
                      <span className="cl-lg cl-chapcard__cup" title="Position in this season's Chapter Cup">
                        Cup #{place + 1}
                      </span>
                    ) : null}
                  </span>
                  <span className="cl-chapcard__body">
                    <span className="cl-chapcard__tag">{c.tagline}</span>
                    <span className="cl-chapcard__facts">
                      <span>
                        <strong>{people.length}</strong> members · {premium} premium
                      </span>
                      <span>{c.meets}</span>
                      {lead ? (
                        <span>
                          Led by <strong>{`${lead.firstname} ${lead.surname}`}</strong>
                        </span>
                      ) : null}
                    </span>
                    <span className="cl-chapcard__next">
                      {next ? (
                        <>
                          <span className="cl-label">Next</span> {next.title} · <DateLabel iso={next.startsAt} />
                        </>
                      ) : (
                        <span className="cl-label">Nothing planned yet</span>
                      )}
                    </span>
                  </span>
                </a>
              );
            })}
      </div>
    </div>
  );
}
