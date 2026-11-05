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

/**
 * The membership state, beside the name.
 *
 * The PLAN is not here: it is the banner's badge, exactly where the member card puts it, because the
 * tier picks which card is drawn rather than being one fact among others.
 */
function StatusPill({ member }: { member: MemberRow | undefined }) {
  const status = firstString(member ?? {}, ['status']);
  if (!status) return null;
  const suspended = status === 'suspended';
  return (
    <span className={`ph__pill ph__pill--${suspended ? 'suspended' : 'active'}`}>{suspended ? 'Suspended' : 'Active'}</span>
  );
}

/**
 * The availability line.
 *
 * THREE STATES, ALL DESIGNED, because all three are reachable by clicking a real row in the seeded
 * directory: half the members publish nothing at all, some publish days that are entirely booked,
 * and the rest have something free. An "empty" that only a fixture can reach is an empty nobody
 * believes, so the seed makes each of these navigable.
 *
 * THE TWO EMPTY STATES NAME THE MEMBER. "Publishes no availability" is also what this line says for a
 * calendar it does not recognise, so on its own it cannot tell a real empty calendar from a broken
 * key. Saying WHOSE calendar is empty ties the sentence to the member it was rendered for — which is
 * better copy, and is also what lets a flow assert on it (see profile.evidence.ts).
 */
function Availability({ calendar, firstName }: { calendar: Calendar | undefined; firstName: string | undefined }) {
  // PROBED, NOT TRUSTED. `calendar?.days.length` was the first version, and the optional chain guards
  // only `calendar` — hand it anything else shaped differently and `.length` throws, React tears the
  // whole region down, and every check sharing that page session afterwards reports a pristine screen
  // it can no longer explain. `flow-mutation` found this by feeding the step a value the region cannot
  // mistake for the real one, which is precisely the job it exists to do.
  //
  // An island must render from defaults alone, and "the key holds something I do not recognise" is one
  // of those defaults — the empty state is the honest answer, not a crash.
  const dayList = Array.isArray(calendar?.days) ? calendar.days : [];
  const days = dayList.length;
  if (days === 0) {
    return (
      <p className="ph__avail ph__avail--none">
        <span className="ph__dot ph__dot--none" aria-hidden="true" />
        {firstName ? `${firstName} publishes no availability` : 'Publishes no availability'}
      </p>
    );
  }
  const free = typeof calendar?.freeCount === 'number' && Number.isFinite(calendar.freeCount) ? calendar.freeCount : 0;
  if (free === 0) {
    return (
      <p className="ph__avail ph__avail--full">
        <span className="ph__dot ph__dot--full" aria-hidden="true" />
        {firstName ? `${firstName} is fully booked for the next two weeks` : 'Fully booked for the next two weeks'}
      </p>
    );
  }
  return (
    <p className="ph__avail ph__avail--open">
      <span className="ph__dot ph__dot--open" aria-hidden="true" />
      {/* ONE flex item: the line is a flex row (dot + text), so a bare <strong> beside text nodes
          became separate items and the row's gap opened a hole between the count and its noun. */}
      <span>
        <strong>{free}</strong> free {free === 1 ? 'time' : 'times'} across {days} {days === 1 ? 'day' : 'days'}
      </span>
    </p>
  );
}

/**
 * The profile page's header, IN THE MEMBER CARD'S DESIGN.
 *
 * It used to be a second design of the same person — its own band, its own fact boxes — sitting a few
 * hundred pixels from the member card, which showed the same name, email, number and date again. Two
 * renderings of one row on one screen read as a bug. So the card's design became the header and the
 * card left the page: this renders the card's own classes (`mc mc--<tier>`), so the two tiers are the
 * card's two tiers, and `ph` only adds what a page header needs on top — the width, the back control,
 * the membership state and the availability line.
 *
 * It renders from DEFAULTS ALONE — every prop is optional and the empty hero is the first thing
 * anyone sees while a member id is still being resolved. Rows are probed with `firstString` rather
 * than destructured, for the same reason the directory probes them: the backend hands back loosely
 * typed rows, and a profile that throws on a missing column is worse than one that shows a dash.
 */
export function ProfileHero({ member, calendar, loading = false, onBack, fit }: ProfileHeroProps) {
  void fit;
  const firstName = firstString(member ?? {}, ['firstname']);
  const name = [firstName, firstString(member ?? {}, ['surname'])].filter(Boolean).join(' ');
  const chapter = firstString(member ?? {}, ['chapter']);
  const email = firstString(member ?? {}, ['email']);
  const memberNo = firstString(member ?? {}, ['member_no', 'memberNo']);
  // Through the SAME formatter the card uses — two date formats on one product read as two products.
  const joinedRaw = firstString(member ?? {}, ['joined']);
  const joined = joinedRaw ? ddmmyyyy(joinedRaw) : undefined;
  const photo = firstString(member ?? {}, ['photo']);
  // The plan picks the CARD, as it does in MemberCard: premium unless the row says standard.
  const tier = firstString(member ?? {}, ['plan']) === 'standard' ? 'standard' : 'premium';
  const hasPlan = Boolean(firstString(member ?? {}, ['plan']));

  if (loading) {
    return (
      <section className="mc mc--premium mc--loading ph" aria-busy="true" aria-label="Loading profile">
        <div className="mc__banner">
          <span className="mc-skel mc-skel--pill" />
        </div>
        <div className="mc__body">
          <div className="mc__identity">
            <span className="mc-skel mc-skel--avatar" />
            <span className="mc__skel-lines">
              <span className="mc-skel mc-skel--line" style={{ width: '42%' }} />
              <span className="mc-skel mc-skel--line" style={{ width: '26%' }} />
            </span>
          </div>
          <div className="ph__details">
            <span className="mc-skel mc-skel--box" />
            <span className="mc-skel mc-skel--box" />
            <span className="mc-skel mc-skel--box" />
          </div>
        </div>
      </section>
    );
  }

  const facts = (
    <>
      <div className="mc__field mc__field--email">
        <span className="mc__label">Email</span>
        <span className={`mc__value mc__value--link${email ? '' : ' mc__value--empty'}`}>{email || '—'}</span>
      </div>
      <div className="mc__field">
        <span className="mc__label">Joined</span>
        <span className={`mc__value mc__value--strong${joined ? '' : ' mc__value--empty'}`}>{joined || '—'}</span>
      </div>
      <div className="mc__field mc__field--number">
        <span className="mc__label">Member no.</span>
        <span className={`mc__value mc__value--number${memberNo ? '' : ' mc__value--empty'}`}>{memberNo || '—'}</span>
      </div>
    </>
  );

  return (
    <section className={`mc mc--${tier}${name ? '' : ' mc--empty'} ph`} aria-label={name ? `Profile of ${name}` : 'Profile'}>
      <div className="mc__banner">
        {onBack ? (
          <button type="button" className="ph__back" onClick={() => onBack()}>
            <span aria-hidden="true">←</span> Directory
          </button>
        ) : (
          <span />
        )}
        {hasPlan ? <span className={`mc-pill mc-pill--${tier}`}>{tier}</span> : null}
      </div>

      <div className="mc__body">
        <div className="mc__identity">
          {photo ? (
            <img className="mc__avatar mc__avatar--photo" src={photo} alt="" loading="lazy" />
          ) : (
            <span className={`mc__avatar${name ? '' : ' mc__avatar--blank'}`} aria-hidden="true">
              {initialsOf(name) || '·'}
            </span>
          )}
          <span className="mc__who">
            <h1 className="mc__name">{name || 'Select a member'}</h1>
            <p className="mc__chapter">{chapter || 'No chapter on file'}</p>
            <StatusPill member={member} />
          </span>
        </div>

        {/* Standard gathers its details into one frosted panel; premium floats them on the cream —
            the card's rule, at header width. */}
        <div className={`ph__details${tier === 'standard' ? ' mc__panel' : ''}`}>{facts}</div>

        <Availability calendar={calendar} firstName={firstName} />
      </div>
    </section>
  );
}
