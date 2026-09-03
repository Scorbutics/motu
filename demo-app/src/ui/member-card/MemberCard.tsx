import type { MotuFit } from '@motu/core';
import { initialsOf, type MemberDraft } from '../../shared/member-draft.js';

export interface MemberCardProps {
  /** The draft the form publishes. Absent or empty is a designed state, not a broken one. */
  draft?: MemberDraft;
  /** The skeleton state: the shape is known before the data is. */
  loading?: boolean;
  /** Contact/edit actions under the card. The design's default is without them. */
  showActions?: boolean;
  /** `card` or the members-list `row` (full width, one line). */
  layout?: 'card' | 'row';
  /** Injected footprint, for the fit axis. CSS-only island: accepted and unused. */
  fit?: MotuFit;
}

/** The product mark that sits in the card's header, as drawn in the design. */
function BrandChip() {
  return (
    <span className="mc__brand">
      <span className="mc__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      </span>
      motu demo-app
    </span>
  );
}

function Avatar({ draft }: { draft: MemberDraft | undefined }) {
  const initials = initialsOf(draft?.fullName);
  if (draft?.photo) return <img className="mc__avatar mc__avatar--photo" src={draft.photo} alt="" loading="lazy" />;
  return (
    <span className={`mc__avatar${initials ? '' : ' mc__avatar--blank'}`} aria-hidden="true">
      {initials || '·'}
    </span>
  );
}

/**
 * The member card, from the design.
 *
 * TWO CARDS, NOT ONE RESTYLED. The tier does not tint a shared card — it picks a different one, which
 * is what the design draws and why `tier` reads as a variant rather than a colour:
 *
 *   PREMIUM   a deep-teal banner with a coral badge, cream body, and the member number in coral —
 *             the number is the thing being sold, so it is the thing that is coloured.
 *   STANDARD  the whole card in bright teal, its details in one frosted panel, badge in white.
 *
 * Everything is a function of one region key plus its own display props, so there is no second source
 * of truth to drift — and every field has a resting state, because the island must render from
 * defaults alone and an empty card is the first thing anyone sees.
 */
export function MemberCard({ draft, loading = false, showActions = false, layout = 'card', fit }: MemberCardProps) {
  void fit;
  const tier = draft?.tier ?? 'premium';
  const name = draft?.fullName?.trim();
  const chapter = draft?.chapter?.trim();
  const email = draft?.email?.trim();

  if (loading) {
    return (
      <article className={`mc mc--${tier} mc--loading`} aria-busy="true" aria-label="Loading member">
        <div className="mc__banner">
          <span className="mc-skel mc-skel--pill" />
        </div>
        <div className="mc__body">
          <div className="mc__identity">
            <span className="mc-skel mc-skel--avatar" />
            <span className="mc__skel-lines">
              <span className="mc-skel mc-skel--line" style={{ width: '58%' }} />
              <span className="mc-skel mc-skel--line" style={{ width: '38%' }} />
            </span>
          </div>
          <span className="mc-skel mc-skel--box" />
          <span className="mc-skel mc-skel--box" />
        </div>
      </article>
    );
  }

  if (layout === 'row') {
    return (
      <article className={`mc-row mc-row--${tier}`} aria-label={name ? `${name}, ${tier}` : 'Member'}>
        <Avatar draft={draft} />
        <span className="mc-row__who">
          <span className="mc-row__name">{name || 'Unnamed member'}</span>
          <span className="mc-row__chapter">{chapter || 'No chapter yet'}</span>
        </span>
        <span className={`mc-pill mc-pill--${tier}`}>{tier}</span>
        <span className="mc-row__no">{draft?.memberNo ? draft.memberNo : '—'}</span>
      </article>
    );
  }

  const details = (
    <>
      <div className="mc__field mc__field--email">
        <span className="mc__label">Email</span>
        <span className={`mc__value mc__value--link${email ? '' : ' mc__value--empty'}`}>{email || 'not given yet'}</span>
      </div>
      <div className="mc__pair">
        <div className="mc__field">
          <span className="mc__label">Joined</span>
          <span className={`mc__value mc__value--strong${draft?.joined ? '' : ' mc__value--empty'}`}>
            {draft?.joined || '—'}
          </span>
        </div>
        <div className="mc__field mc__field--number">
          <span className="mc__label">Member no.</span>
          <span className={`mc__value mc__value--number${draft?.memberNo ? '' : ' mc__value--empty'}`}>
            {draft?.memberNo || '—'}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <article className={`mc mc--${tier}${name ? '' : ' mc--empty'}`} aria-label="Member card">
      <div className="mc__banner">
        <BrandChip />
        <span className={`mc-pill mc-pill--${tier}`}>{tier}</span>
      </div>

      <div className="mc__body">
        <div className="mc__identity">
          <Avatar draft={draft} />
          <span className="mc__who">
            <h3 className="mc__name">{name || 'Their name appears here'}</h3>
            <p className="mc__chapter">{chapter || 'No chapter yet'}</p>
          </span>
        </div>

        {/* Standard gathers its details into one frosted panel; premium lays them out on the cream. */}
        {tier === 'standard' ? <div className="mc__panel">{details}</div> : details}

        {showActions ? (
          <div className="mc__actions">
            <button type="button" className="mc-btn mc-btn--primary">
              View profile
            </button>
            <button type="button" className="mc-btn">Message</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
