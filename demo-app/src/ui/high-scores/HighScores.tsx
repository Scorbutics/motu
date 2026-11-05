import { HIGH_SCORE_DAYS, type ClubOverview, type Scorer } from '../../shared/gamification.js';
import { CrownIcon, grouped } from '../club/club-bits.js';

export interface HighScoresProps {
  /** The club's game state, whose top three this puts on the podium. Absent renders the empty podium. */
  overview?: ClubOverview;
  /** A member on the podium was picked. The region decides that means their profile. */
  onOpen?: (id: string) => void;
}

/** The podium's order left to right: second, first, third — the winner in the middle, raised. */
const ORDER = [1, 0, 2] as const;
const PLACE = ['First', 'Second', 'Third'];

/**
 * The podium: the three members who earned the most XP in the last 30 days.
 *
 * "LAST 30 DAYS", where the design says "this month": a calendar month empties the podium on the 1st
 * and ties everyone for a week after. Each place is a button that opens the member — a leaderboard you
 * can only look at is a poster.
 */
export function HighScores({ overview, onOpen }: HighScoresProps) {
  const top = overview?.highScores ?? [];
  return (
    <section className="cl-scores cl-panel cl-block" aria-label="High scores">
      <div className="cl-panel__top">
        <h2 className="cl-lg">High scores</h2>
        <span className="cl-kick">Last {HIGH_SCORE_DAYS} days · XP</span>
      </div>
      {top.length === 0 ? (
        <p className="cl-empty" style={{ paddingBottom: 12 }}>
          Nobody has scored yet.
        </p>
      ) : (
        <div className="cl-podium">
          {ORDER.map((i) => {
            const s: Scorer | undefined = top[i];
            if (!s) return <span key={i} />;
            const place = i + 1;
            return (
              <button
                key={s.id}
                type="button"
                className={`cl-podium__spot cl-podium__spot--${place}`}
                onClick={() => onOpen?.(s.id)}
                aria-label={`${PLACE[i]}: ${s.name}, ${grouped(s.xp)} XP`}
              >
                {place === 1 ? <CrownIcon /> : null}
                <span className="cl-podium__who">{s.short}</span>
                <span className="cl-lg cl-podium__xp">{grouped(s.xp)} XP</span>
                <span className="cl-lg cl-podium__step">{place}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
