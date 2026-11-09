import type { ClubOverview } from '../../shared/gamification.js';
import { memberStats, rankOf, shortChapter } from '../../shared/gamification.js';
import { firstString, type MemberRow } from '../../shared/member-types.js';
import { HotFlame, WarmFlame, chapterColor, grouped, initials } from '../club/club-bits.js';

export interface MyStandingProps {
  /** Who is signed in. Null or absent is a guest. */
  me?: MemberRow | null;
  /** The day the level and streak are computed for. Absent is today. */
  asOf?: string | null;
  /** The club's game state: where the member's chapter stands in the Cup. */
  overview?: ClubOverview | null;
  /** How many upcoming events they are going to. */
  myRsvps?: string[];
}

/**
 * The top of My club: who you are in the club today — your rank and level, your streak, and where
 * your chapter stands — in the same blocks the directory and the profile draw.
 *
 * Every number is the club's own rules (`memberStats`, `clubOverview`) over your row on `asOf`; none
 * of it is stored, so it is the same number the directory's table shows for you.
 */
export function MyStanding({ me = null, asOf, overview = null, myRsvps = [] }: MyStandingProps) {
  if (!me) {
    return (
      <header className="cl-head cl-me">
        <div className="cl-head__title cl-block cl-me__id">
          <span className="cl-me__ava cl-me__ava--guest" aria-hidden="true">?</span>
          <div className="cl-me__hello">
            <span className="cl-me__kick">Welcome to the club</span>
            <h1 className="cl-lg">You&rsquo;re browsing as a guest</h1>
            <p className="cl-me__line">Use Switch in the sidebar to act as a member and see their club.</p>
          </div>
        </div>
      </header>
    );
  }

  const first = firstString(me, ['firstname']) ?? '';
  const last = firstString(me, ['surname']) ?? '';
  const chapter = firstString(me, ['chapter']) ?? null;
  const day = asOf || new Date().toISOString().slice(0, 10);
  const s = memberStats(me, day);
  const rank = rankOf(s.level);
  const cupAt = chapter && overview ? overview.cup.findIndex((c) => c.chapter === chapter) : -1;
  const suspended = me.status === 'suspended';

  return (
    <header className="cl-head cl-me">
      <div className="cl-head__title cl-block cl-me__id">
        <span className="cl-me__ava" aria-hidden="true" style={{ background: chapter ? chapterColor(chapter) : undefined }}>
          {initials(first, last)}
        </span>
        <div className="cl-me__hello">
          <span className="cl-me__kick">{suspended ? 'Membership suspended' : 'Welcome back'}</span>
          <h1 className="cl-lg">{first}</h1>
          <p className="cl-me__line">
            {chapter ? `${chapter}` : 'No chapter'}
            {cupAt >= 0 ? ` · #${cupAt + 1} in the Chapter Cup` : ''}
            {` · ${myRsvps.length === 0 ? 'no events booked' : `${myRsvps.length} event${myRsvps.length === 1 ? '' : 's'} booked`}`}
          </p>
        </div>
      </div>
      <div className="cl-head__club cl-block cl-me__game">
        <div className="cl-head__club-top">
          <span className="cl-lg">
            Level {s.level} · {rank}
          </span>
          <small>
            {grouped(s.xp)} XP · {s.progress}% to Lv {s.level + 1}
          </small>
        </div>
        <div className="cl-bar" role="progressbar" aria-label={`Progress to level ${s.level + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.progress}>
          <span className="cl-seg" style={{ width: `${s.progress}%` }} />
        </div>
        <span className="cl-me__streak">
          {s.streak > 0 ? (s.hot ? <HotFlame /> : <WarmFlame />) : null}
          {suspended ? 'Streaks pause while suspended' : s.streak > 0 ? `${s.streak}-day streak` : 'No streak running'}
          {chapter && cupAt >= 0 && overview ? ` · ${shortChapter(chapter)}: ${grouped(overview.cup[cupAt]!.points)} season pts` : ''}
        </span>
      </div>
    </header>
  );
}
