import { agoLabel, type ClubOverview, type UnlockKind } from '../../shared/gamification.js';

export interface FreshUnlocksProps {
  /** The club's game state, whose `unlocks` this lists. Absent renders the quiet feed. */
  overview?: ClubOverview;
  /** "Details" was picked on a line. The region decides that means the member's profile. */
  onOpen?: (id: string) => void;
}

const KIND_LABEL: Record<UnlockKind, string> = { streak: 'Streak', level: 'Level up', anniversary: 'Anniversary' };

/**
 * What members unlocked this week: a streak milestone, a level, a membership anniversary.
 *
 * Every line is something that HAPPENED by the club's rules on that day (`gamification.ts` →
 * `unlocksOf`) — a member does reach their 30th consecutive day, a level, their joining date — and
 * "Details" opens the member it is about. The design's "went Premium" is not here: the members table
 * keeps no history of plan changes, so no rule could say when one happened.
 */
export function FreshUnlocks({ overview, onOpen }: FreshUnlocksProps) {
  const unlocks = overview?.unlocks ?? [];
  return (
    <section className="cl-feed cl-panel cl-block" aria-label="Fresh unlocks" style={{ flex: 1 }}>
      <h2 className="cl-lg">Fresh unlocks</h2>
      {unlocks.length === 0 ? <p className="cl-empty">Nothing unlocked this week yet.</p> : null}
      {unlocks.map((u) => (
        <div key={`${u.kind}-${u.id}-${u.daysAgo}`} className="cl-feed__item">
          <div className="cl-kick">
            {KIND_LABEL[u.kind]} · {agoLabel(u.daysAgo)}
          </div>
          <div className="cl-feed__text">
            <strong>{u.name}</strong> {u.text}{' '}
            <button type="button" className="cl-feed__more" onClick={() => onOpen?.(u.id)} aria-label={`Details for ${u.name}`}>
              Details
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
