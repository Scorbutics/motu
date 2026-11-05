import type { ClubOverview } from '../../shared/gamification.js';

export interface WeeklyQuestProps {
  /** The club's game state, whose `quest` this draws. Absent renders an empty meter. */
  overview?: ClubOverview;
}

/**
 * The quest of the week: one goal the whole club works towards, a meter, and what it unlocks.
 *
 * The quest is measured on the real club (`gamification.ts` → `questOf`): its progress is a count of
 * something the directory already has — burning streaks, premium members, members — so the meter
 * moves when the club does, not when someone edits a target.
 */
export function WeeklyQuest({ overview }: WeeklyQuestProps) {
  const quest = overview?.quest;
  const pct = quest ? Math.min(100, Math.round((quest.progress / quest.goal) * 100)) : 0;
  return (
    <section className="cl-quest cl-block" aria-label="Weekly quest">
      <div className="cl-quest__inner">
        <div>
          <div className="cl-kick">
            Weekly quest{quest ? ` · ${quest.daysLeft} day${quest.daysLeft === 1 ? '' : 's'} left` : ''}
          </div>
          <div className="cl-lg cl-quest__title">{quest?.title ?? 'No quest this week'}</div>
        </div>
        <div className="cl-quest__meter">
          <div className="cl-bar" role="progressbar" aria-label="Quest progress" aria-valuemin={0} aria-valuemax={quest?.goal ?? 0} aria-valuenow={quest?.progress ?? 0}>
            <span className="cl-seg" style={{ width: `${pct}%` }} />
          </div>
          <span className="cl-lg cl-quest__count">{quest ? `${quest.progress}/${quest.goal}` : '—'}</span>
        </div>
        {quest ? (
          <div className="cl-quest__reward">
            Reward: <strong>{quest.reward}</strong>
          </div>
        ) : null}
      </div>
      <div className="cl-quest__rivets" aria-hidden="true">
        <span />
        <span />
      </div>
    </section>
  );
}
