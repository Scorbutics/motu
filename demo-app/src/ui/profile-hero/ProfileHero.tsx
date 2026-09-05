import type { MotuFit } from '@motu/core';
import type { Calendar } from '../../shared/availability-types.js';
import type { MemberRow } from '../../shared/member-types.js';
import { firstString } from '../../shared/member-types.js';
import { ddmmyyyy, initialsOf } from '../../shared/member-draft.js';

export interface ProfileHeroProps {
  /** The member this profile is of. Absent is a designed state: the route has not resolved yet. */
  member?: MemberRow;
  /**
   * Their published availability, for the one-line summary.
   *
   * READ, NEVER WRITTEN. The hero reports how much there is; picking a day out of it belongs to the
   * calendar islands beside it, which own that choice. A hero that also selected a day would be a
   * second writer of a key it does not own, and the region's declaration is what says so.
   */
  calendar?: Calendar;
  /** The shape is known before the data is. */
  loading?: boolean;
  /** Back to the directory. A navigation intent — the region decides what it means. */
  onBack?: () => void;
  /** Injected footprint, for the fit axis. */
  fit?: MotuFit;
}

/** The badge row: membership state and plan, spelled as the directory spells them. */
function Pills({ member }: { member: MemberRow | undefined }) {
  const status = firstString(member ?? {}, ['status']);
  const plan = firstString(member ?? {}, ['plan']);
  return (
    <span className="ph__pills">
      {plan ? (
        <span className={`ph__pill ph__pill--${plan === 'premium' ? 'premium' : 'standard'}`}>
          {plan === 'premium' ? 'Premium' : 'Standard'}
        </span>
      ) : null}
      {status ? (
        <span className={`ph__pill ph__pill--${status === 'suspended' ? 'suspended' : 'active'}`}>
          {status === 'suspended' ? 'Suspended' : 'Active'}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The availability line.
 *
 * THREE STATES, ALL DESIGNED, because all three are reachable by clicking a real row in the seeded
 * directory: half the members publish nothing at all, some publish days that are entirely booked,
 * and the rest have something free. An "empty" that only a fixture can reach is an empty nobody
 * believes, so the seed makes each of these navigable.
 */
function Availability({ calendar }: { calendar: Calendar | undefined }) {
  // PROBED, NOT TRUSTED. `calendar?.days.length` was the first version, and the optional chain guards
  // only `calendar` — hand it anything else shaped differently and `.length` throws, React tears the
  // whole region down, and every check sharing that page session afterwards reports a pristine screen
  // it can no longer explain. `flow-mutation` found this by feeding the step a value the region cannot
  // mistake for the real one, which is precisely the job it exists to do: nothing else in the set
  // renders this island with a wrong-shaped key, because nothing else tries to.
  //
  // An island must render from defaults alone, and "the key holds something I do not recognise" is one
  // of those defaults — the empty state is the honest answer, not a crash.
  const dayList = Array.isArray(calendar?.days) ? calendar.days : [];
  const days = dayList.length;
  if (days === 0) {
    return (
      <p className="ph__avail ph__avail--none">
        <span className="ph__dot ph__dot--none" aria-hidden="true" />
        Publishes no availability
      </p>
    );
  }
  const free = typeof calendar?.freeCount === 'number' && Number.isFinite(calendar.freeCount) ? calendar.freeCount : 0;
  if (free === 0) {
    return (
      <p className="ph__avail ph__avail--full">
        <span className="ph__dot ph__dot--full" aria-hidden="true" />
        Fully booked for the next two weeks
      </p>
    );
  }
  return (
    <p className="ph__avail ph__avail--open">
      <span className="ph__dot ph__dot--open" aria-hidden="true" />
      <strong>{free}</strong> free {free === 1 ? 'time' : 'times'} across {days} {days === 1 ? 'day' : 'days'}
    </p>
  );
}

/** One labelled fact under the identity. */
function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="ph__fact">
      <span className="ph__fact-label">{label}</span>
      <span className={`ph__fact-value${value ? '' : ' ph__fact-value--empty'}`}>{value || '—'}</span>
    </div>
  );
}

/**
 * The profile page's identity band.
 *
 * It renders from DEFAULTS ALONE — every prop is optional and the empty hero is the first thing
 * anyone sees while a member id is still being resolved. Rows are probed with `firstString` rather
 * than destructured, for the same reason the directory probes them: the backend hands back loosely
 * typed rows, and a profile that throws on a missing column is worse than one that shows a dash.
 */
export function ProfileHero({ member, calendar, loading = false, onBack, fit }: ProfileHeroProps) {
  void fit;
  const name = [firstString(member ?? {}, ['firstname']), firstString(member ?? {}, ['surname'])]
    .filter(Boolean)
    .join(' ');
  const chapter = firstString(member ?? {}, ['chapter']);
  const email = firstString(member ?? {}, ['email']);
  const memberNo = firstString(member ?? {}, ['member_no', 'memberNo']);
  // Through the SAME formatter the card uses. See `ddmmyyyy` — these two render a few hundred
  // pixels apart, and two date formats on one screen read as two applications.
  const joinedRaw = firstString(member ?? {}, ['joined']);
  const joined = joinedRaw ? ddmmyyyy(joinedRaw) : undefined;
  const photo = firstString(member ?? {}, ['photo']);

  if (loading) {
    return (
      <section className="ph ph--loading" aria-busy="true" aria-label="Loading profile">
        <div className="ph__band">
          <span className="ph-skel ph-skel--avatar" />
          <span className="ph__skel-lines">
            <span className="ph-skel ph-skel--line" style={{ width: '42%' }} />
            <span className="ph-skel ph-skel--line" style={{ width: '26%' }} />
          </span>
        </div>
        <div className="ph__facts">
          <span className="ph-skel ph-skel--box" />
          <span className="ph-skel ph-skel--box" />
          <span className="ph-skel ph-skel--box" />
        </div>
      </section>
    );
  }

  return (
    <section className="ph" aria-label={name ? `Profile of ${name}` : 'Profile'}>
      <div className="ph__band">
        {onBack ? (
          <button type="button" className="ph__back" onClick={() => onBack()}>
            <span aria-hidden="true">←</span> Directory
          </button>
        ) : null}
        <div className="ph__identity">
          {photo ? (
            <img className="ph__avatar ph__avatar--photo" src={photo} alt="" loading="lazy" />
          ) : (
            <span className={`ph__avatar${name ? '' : ' ph__avatar--blank'}`} aria-hidden="true">
              {initialsOf(name) || '·'}
            </span>
          )}
          <div className="ph__names">
            <h1 className="ph__name">{name || 'Select a member'}</h1>
            <p className="ph__chapter">{chapter || 'No chapter on file'}</p>
            <Pills member={member} />
          </div>
        </div>
      </div>
      <div className="ph__facts">
        <Fact label="Email" value={email} />
        <Fact label="Member no." value={memberNo} />
        <Fact label="Joined" value={joined} />
      </div>
      <Availability calendar={calendar} />
    </section>
  );
}
