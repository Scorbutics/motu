import type { MotuFit } from '@motujs/core';
import type { Calendar } from '../../shared/availability-types.js';
import type { MemberRow } from '../../shared/member-types.js';
import { firstString } from '../../shared/member-types.js';
import { ddmmyyyy, initialsOf } from '../../shared/member-draft.js';
import { memberStats, rankOf, todayIso } from '../../shared/gamification.js';
import { chapterColor, GemIcon, grouped, HotFlame, WarmFlame } from '../club/club-bits.js';

export interface ProfileHeroProps {
  /** The member this profile is of. Absent is a designed state: the route has not resolved yet. */
  member?: MemberRow;
  /**
   * Their published availability, for the one-line summary.
   *
   * READ, NEVER WRITTEN. The hero reports how much there is; picking a day out of it belongs to the
   * calendar islands beside it, which own that choice.
   */
  calendar?: Calendar;
  /** The day the member's level and streak are computed for (`YYYY-MM-DD`). Absent means today. */
  asOf?: string;
  /** The shape is known before the data is. */
  loading?: boolean;
  /** Back to the directory. A navigation intent — the region decides what it means. */
  onBack?: () => void;
  /** Injected footprint, for the fit axis. */
  fit?: MotuFit;
}

/**
 * The availability line.
 *
 * THREE STATES, ALL DESIGNED, because all three are reachable by clicking a real row in the seeded
 * directory: odd numbers and suspended members publish nothing, numbers ending in 6 are booked out,
 * and the rest have something free.
 *
 * THE TWO EMPTY STATES NAME THE MEMBER. "Publishes no availability" is also what this line says for a
 * calendar it does not recognise; saying WHOSE ties the sentence to the member it was rendered for —
 * better copy, and what lets a flow assert on it.
 */
function Availability({ calendar, firstName }: { calendar: Calendar | undefined; firstName: string | undefined }) {
  // PROBED, NOT TRUSTED: a key holding something of another shape renders the empty state, not a crash.
  const days = Array.isArray(calendar?.days) ? calendar.days.length : 0;
  if (days === 0) {
    return (
      <p className="cl-ph__avail cl-ph__avail--none">
        <span className="cl-ph__dot" aria-hidden="true" />
        {firstName ? `${firstName} publishes no availability` : 'Publishes no availability'}
      </p>
    );
  }
  const free = typeof calendar?.freeCount === 'number' && Number.isFinite(calendar.freeCount) ? calendar.freeCount : 0;
  if (free === 0) {
    return (
      <p className="cl-ph__avail cl-ph__avail--full">
        <span className="cl-ph__dot" aria-hidden="true" />
        {firstName ? `${firstName} is fully booked for the next two weeks` : 'Fully booked for the next two weeks'}
      </p>
    );
  }
  return (
    <p className="cl-ph__avail cl-ph__avail--open">
      <span className="cl-ph__dot" aria-hidden="true" />
      <span>
        <strong>{free}</strong> free {free === 1 ? 'time' : 'times'} across {days} {days === 1 ? 'day' : 'days'}
      </span>
    </p>
  );
}

function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="cl-ph__fact">
      <span className="cl-label">{label}</span>
      <span className={`cl-ph__fact-value${value ? '' : ' cl-ph__fact-value--empty'}`}>{value || '—'}</span>
    </div>
  );
}

/**
 * The profile's header, in the club's design: who they are in the red block, where they stand in the
 * club's game in the teal one.
 *
 * THE GAME BLOCK IS THE SAME RULES THE DIRECTORY RUNS (`gamification.ts`), for the same `asOf`, so a
 * member's level here is the level beside their name in the table — one function, two screens. A
 * suspended membership shows the level it reached; its streak is over.
 *
 * It renders from DEFAULTS ALONE — every prop is optional and the empty header is the first thing
 * anyone sees while a member id is still being resolved. Rows are probed with `firstString`, for the
 * reason the directory probes them: a profile that throws on a missing column is worse than a dash.
 */
export function ProfileHero({ member, calendar, asOf, loading = false, onBack, fit }: ProfileHeroProps) {
  void fit;
  const firstName = firstString(member ?? {}, ['firstname']);
  const name = [firstName, firstString(member ?? {}, ['surname'])].filter(Boolean).join(' ');
  const chapter = firstString(member ?? {}, ['chapter']);
  const email = firstString(member ?? {}, ['email']);
  const memberNo = firstString(member ?? {}, ['member_no', 'memberNo']);
  const joinedRaw = firstString(member ?? {}, ['joined']);
  const joined = joinedRaw ? ddmmyyyy(joinedRaw) : undefined;
  const photo = firstString(member ?? {}, ['photo']);
  const plan = firstString(member ?? {}, ['plan']);
  const status = firstString(member ?? {}, ['status']);
  const stats = member ? memberStats(member, asOf || todayIso()) : null;

  if (loading) {
    return (
      <section className="cl-ph" aria-busy="true" aria-label="Loading profile">
        <div className="cl-ph__top">
          <div className="cl-ph__id cl-block">
            <div className="cl-ph__who">
              <span className="cl-ph__ava" />
              <span style={{ flex: 1, display: 'grid', gap: 10 }}>
                <span className="cl-ph-skel" style={{ width: '50%', height: 30 }} />
                <span className="cl-ph-skel" style={{ width: '30%', height: 12 }} />
              </span>
            </div>
          </div>
          <div className="cl-ph__game cl-block">
            <span className="cl-ph-skel" style={{ width: '60%', height: 24 }} />
            <span className="cl-ph-skel" style={{ height: 12 }} />
          </div>
        </div>
        <div className="cl-ph__facts">
          <span className="cl-skel cl-skel--box" />
          <span className="cl-skel cl-skel--box" />
          <span className="cl-skel cl-skel--box" />
        </div>
      </section>
    );
  }

  return (
    <section className="cl-ph" aria-label={name ? `Profile of ${name}` : 'Profile'}>
      <div className="cl-ph__top">
        <div className="cl-ph__id cl-block">
          {onBack ? (
            <button type="button" className="cl-btn cl-lg cl-ph__back" onClick={() => onBack()}>
              ‹ Members
            </button>
          ) : null}
          <div className="cl-ph__who">
            <span className="cl-ph__ava" aria-hidden="true">
              {photo ? <img src={photo} alt="" loading="lazy" /> : initialsOf(name) || '·'}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="cl-lg cl-ph__name">{name || 'Select a member'}</h1>
              <p className="cl-ph__chapter">
                {chapter ? <span className="cl-chap__dot" aria-hidden="true" style={{ background: chapterColor(chapter), display: 'inline-block', marginRight: 6 }} /> : null}
                {chapter || 'No chapter on file'}
              </p>
            </div>
          </div>
          <div className="cl-ph__pills">
            {plan ? (
              <span className={`cl-lg cl-ph__pill cl-ph__pill--${plan === 'premium' ? 'premium' : 'standard'}`}>
                {plan === 'premium' ? (
                  <>
                    <GemIcon /> Premium
                  </>
                ) : (
                  'Standard'
                )}
              </span>
            ) : null}
            {status ? (
              <span className={`cl-lg cl-ph__pill cl-ph__pill--${status === 'suspended' ? 'suspended' : 'active'}`}>
                {status === 'suspended' ? 'Suspended' : 'Active'}
              </span>
            ) : null}
          </div>
        </div>

        <div className="cl-ph__game cl-block" aria-label="Standing in the club">
          <div className="cl-ph__game-top">
            <span className="cl-lg">{stats ? `Level ${stats.level} · ${rankOf(stats.level)}` : 'Level —'}</span>
            {/* THE LABEL READS THE WAY THE BAR FILLS: the bar is progress through this level, as in
                the members table, so the label says that — not "XP / next threshold", which put a
                one-fifth bar under a label that looked nearly done. */}
            <small>{stats ? `${grouped(stats.xp)} XP · ${stats.progress}% to Lv ${stats.level + 1}` : '—'}</small>
          </div>
          <div
            className="cl-bar"
            role="progressbar"
            aria-label={stats ? `Level ${stats.level}, ${stats.progress}% to level ${stats.level + 1}` : 'Level progress'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stats?.progress ?? 0}
          >
            <span className="cl-seg" style={{ width: `${stats?.progress ?? 0}%` }} />
          </div>
          <div className="cl-ph__streak">
            {stats?.hot ? <HotFlame /> : stats && stats.streak > 0 ? <WarmFlame /> : null}
            {!stats ? 'No streak yet' : stats.streak > 0 ? `${stats.streak}-day streak` : status === 'suspended' ? 'Streak ended' : 'No streak running'}
          </div>
        </div>
      </div>

      <div className="cl-ph__facts">
        <Fact label="Email" value={email} />
        <Fact label="Joined" value={joined} />
        <Fact label="Member no." value={memberNo} />
      </div>
      <Availability calendar={calendar} firstName={firstName} />
    </section>
  );
}
