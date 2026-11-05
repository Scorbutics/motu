import type { ClubOverview } from '../../shared/gamification.js';
import { chapterColor, grouped } from '../club/club-bits.js';

export interface ChapterCupProps {
  /** The club's game state, whose `cup` this ranks. Absent renders the empty table. */
  overview?: ClubOverview;
}

/**
 * The Chapter Cup: every chapter's season points, as bars in the chapter's own colour — the same
 * colour as its square in the members table.
 *
 * Season points are the XP a chapter's members earned since 1 January, in hundreds — so a chapter
 * climbs by having members who show up, not by being old. A bar never drops below 40% of the track,
 * as the design draws it, so the last chapter's name still fits inside its bar.
 */
export function ChapterCup({ overview }: ChapterCupProps) {
  const cup = overview?.cup ?? [];
  const best = cup[0]?.points || 1;
  return (
    <section className="cl-cup cl-panel cl-block" aria-label="Chapter Cup">
      <div className="cl-panel__top">
        <h2 className="cl-lg">Chapter Cup</h2>
        <span className="cl-kick">Season pts</span>
      </div>
      {cup.length === 0 ? <p className="cl-empty">No chapter has scored yet.</p> : null}
      {cup.map((c, i) => (
        <div key={c.chapter} className="cl-cup__row" title={c.chapter}>
          <div className="cl-cup__track">
            <div className="cl-cup__fill" style={{ width: `${Math.max(40, Math.round((c.points / best) * 100))}%`, background: chapterColor(c.chapter) }}>
              <span className="cl-lg">
                {i + 1}. {c.short}
              </span>
            </div>
          </div>
          <span className="cl-cup__pts">{grouped(c.points)}</span>
        </div>
      ))}
    </section>
  );
}
