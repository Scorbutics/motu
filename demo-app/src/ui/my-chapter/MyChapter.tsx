import type { Chapter } from '../../shared/chapter-types.js';
import type { ClubEvent } from '../../shared/event-types.js';
import type { ClubOverview } from '../../shared/gamification.js';
import { grouped } from '../club/club-bits.js';
import { chapterColor } from '../club/club-bits.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { dateParts } from '../club/event-bits.js';

export interface MyChapterProps {
  /** Who is signed in: their chapter is the one shown. */
  me?: MemberRow | null;
  /** Every chapter, as the club describes them. */
  chapters?: Chapter[];
  /** Every upcoming event — the chapter's next one is picked from these. */
  events?: ClubEvent[];
  /** The club's game state: the chapter's Cup position and its size. */
  overview?: ClubOverview | null;
  /** Open the chapter's page. */
  onOpenChapter?: (slug: string) => void;
}

/**
 * Your chapter at a glance: where and when it meets, where it stands in the Cup, and its next event.
 * A guest is pointed at the chapters page instead — every chapter is open to visitors.
 */
export function MyChapter({ me = null, chapters = [], events = [], overview = null, onOpenChapter }: MyChapterProps) {
  const name = me ? firstString(me, ['chapter']) : undefined;
  const chapter = chapters.find((c) => c.name === name);
  if (!chapter) {
    return (
      <section className="cl-panel cl-block cl-mychap" aria-label="Your chapter">
        <div className="cl-panel__top">
          <h2 className="cl-lg">Your chapter</h2>
        </div>
        <p className="cl-empty">{me ? 'Your chapter has no page yet.' : 'Every member belongs to one of eight local chapters, and visitors are welcome at all of them.'}</p>
        {onOpenChapter && !me ? (
          <button type="button" className="cl-mine__browse" onClick={() => onOpenChapter('')}>
            Meet the chapters &rsaquo;
          </button>
        ) : null}
      </section>
    );
  }
  const place = overview ? overview.cup.findIndex((c) => c.chapter === chapter.name) : -1;
  const next = events.find((e) => e.chapter === chapter.name);
  return (
    <section className="cl-panel cl-block cl-mychap" aria-label="Your chapter">
      <div className="cl-mychap__band" style={{ background: chapterColor(chapter.name) }}>
        <span className="cl-me__kick">Your chapter</span>
        <h2 className="cl-lg">{chapter.name}</h2>
        <p>{chapter.tagline}</p>
      </div>
      <dl className="cl-mychap__facts">
        <div>
          <dt className="cl-label">Meets</dt>
          <dd>{chapter.meets}</dd>
        </div>
        <div>
          <dt className="cl-label">Chapter Cup</dt>
          <dd>{place >= 0 && overview ? `#${place + 1} of ${overview.cup.length} · ${grouped(overview.cup[place]!.points)} pts` : '—'}</dd>
        </div>
        <div className="cl-mychap__wide">
          <dt className="cl-label">Next chapter event</dt>
          <dd>{next ? `${next.title} · ${dateParts(next.startsAt).weekday} ${dateParts(next.startsAt).day} ${dateParts(next.startsAt).month}` : 'Nothing planned yet'}</dd>
        </div>
      </dl>
      {onOpenChapter ? (
        <button type="button" className="cl-mine__browse cl-mychap__open" onClick={() => onOpenChapter(chapter.slug)}>
          Chapter page &rsaquo;
        </button>
      ) : null}
    </section>
  );
}
