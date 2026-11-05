import type { ClubOverview } from '../../shared/gamification.js';
import { TileFlame } from '../club/club-bits.js';

export interface MemberHighlightsProps {
  /** The club's game state. Absent renders four tiles with dashes — the shape before the numbers. */
  overview?: ClubOverview;
}

/**
 * Four tiles under the header: who joined, who is premium, whose streak is burning, and which chapter
 * leads the Cup. Every number is the club's own, from `overview`.
 *
 * "PAST 12 MONTHS", where the design says "this week": the seed's newest member joined in December
 * 2025, so a weekly count would read +0 on every day anyone looks. And not "this year" either — the
 * rule counts the 365 days up to `asOf`, and a label naming the calendar year promised a count of 2026
 * joiners that was really a count of late-2025 ones.
 */
export function MemberHighlights({ overview }: MemberHighlightsProps) {
  return (
    <section className="cl-tiles" aria-label="Highlights">
      <div className="cl-tile cl-tile--ox cl-block">
        <div className="cl-lg cl-tile__n">{overview ? `+${overview.newThisYear}` : '—'}</div>
        <div className="cl-tile__label">
          New members
          <br />
          past 12 months
        </div>
      </div>
      <div className="cl-tile cl-tile--gold cl-block">
        <div className="cl-lg cl-tile__n">{overview?.premium ?? '—'}</div>
        <div className="cl-tile__label">
          Premium
          <br />
          members
        </div>
      </div>
      <div className="cl-tile cl-tile--orange cl-block">
        <div className="cl-lg cl-tile__n">{overview?.activeStreaks ?? '—'}</div>
        <div className="cl-tile__label">
          Active
          <br />
          streaks
        </div>
        <TileFlame />
      </div>
      <div className="cl-tile cl-tile--navy cl-block">
        <div className="cl-lg cl-tile__n">{overview?.cup[0]?.short ?? '—'}</div>
        <div className="cl-tile__label">
          Leads the
          <br />
          Chapter Cup
        </div>
      </div>
    </section>
  );
}
