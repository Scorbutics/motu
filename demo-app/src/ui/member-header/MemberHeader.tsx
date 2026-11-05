import type { ClubOverview } from '../../shared/gamification.js';
import { grouped, PeopleIcon } from '../club/club-bits.js';

export interface MemberHeaderProps {
  heading?: string;
  /** Kept for the hosts that still pass it; the redesigned header has no subtitle line. */
  subtitle?: string;
  /** Overrides the data pill ("Sample data" / "Live data") — the standalone preview uses it to mark the harness. */
  badge?: string;
  /** The club's game state: its size, its chapters and its level. Absent renders the shape. */
  overview?: ClubOverview;
  /** Which backend answers: `live` says "Live data", anything else "Sample data". */
  dataSource?: 'sandbox' | 'live';
}

/**
 * The members page's header row: the title with the club's size beside it, and the club's level.
 *
 * Every number is the club's own — its members, its chapters, its XP — read from `overview`, never
 * written into the copy. The pill says whether those members are real: the sandbox and the lagoon run
 * on the committed seed, which is SAMPLE data, and the app against Postgres is live.
 */
export function MemberHeader({ heading = 'Members', subtitle, badge, overview, dataSource }: MemberHeaderProps) {
  void subtitle;
  const club = overview?.club;
  const pill = badge ?? (dataSource === 'live' ? 'Live data' : 'Sample data');
  return (
    <header className="cl-head">
      <div className="cl-head__title cl-block">
        <PeopleIcon size={30} stroke="#FBF3E2" />
        <h1 className="cl-lg">{heading}</h1>
        <div className="cl-head__facts">
          {overview ? `${overview.members} members · ${overview.chapters} chapters` : 'The club'}
          <br />
          <span className="cl-head__pill">{pill}</span>
        </div>
      </div>
      <div className="cl-head__club cl-block">
        <div className="cl-head__club-top">
          <span className="cl-lg">{club ? `Club level ${club.level}` : 'Club level'}</span>
          <small>{club ? `${grouped(club.xp)} / ${grouped(club.next)} XP` : '—'}</small>
        </div>
        <div
          className="cl-bar"
          role="progressbar"
          aria-label="Club level progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={club?.progress ?? 0}
        >
          <span className="cl-seg" style={{ width: `${club?.progress ?? 0}%` }} />
        </div>
      </div>
    </header>
  );
}
