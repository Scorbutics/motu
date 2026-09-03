import type { MotuFit } from '@motu/core';
import { completenessOf, initialsOf, type MemberDraft } from '../../shared/member-draft.js';

export interface MemberCardProps {
  /** The draft the form publishes. Absent or empty is a designed state, not a broken one. */
  draft?: MemberDraft;
  /** Injected footprint, for the fit axis. CSS-only island: accepted and unused. */
  fit?: MotuFit;
}

/** The ring around the avatar: one arc per profile field, filled as the draft fills. */
function CompletenessRing({ value }: { value: number }) {
  const size = 76;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="gm-card__ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="gm-card__ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
      <circle
        className="gm-card__ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value)}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The member profile, drawn from whatever the draft holds so far.
 *
 * A CARD THAT IS NEVER BLANK. Every field has a resting state — a placeholder name, a dashed avatar,
 * a muted line where the bio will go — so the island renders from defaults alone AND the empty state
 * is the first thing a designer sees rather than the last. That rule is motu's; the reason to like it
 * is that "what does this look like with nothing in it" is the question UIs usually answer badly.
 *
 * It reads ONE prop. Everything on screen is a function of the draft, which is what makes it safe to
 * drive from a region key: there is no second source of truth to drift.
 */
export function MemberCard({ draft, fit }: MemberCardProps) {
  void fit;
  const name = draft?.fullName?.trim();
  const initials = initialsOf(name);
  const completeness = completenessOf(draft);
  const listed = draft?.listed ?? false;

  return (
    <article className={`gm-card gm-mcard${name ? '' : ' gm-mcard--empty'}`} aria-label="Member preview">
      <div className="gm-mcard__banner" aria-hidden="true" />

      <div className="gm-mcard__identity">
        <div className="gm-mcard__avatar-wrap">
          <CompletenessRing value={completeness} />
          <div className="gm-mcard__avatar">{initials || '—'}</div>
        </div>

        <div className="gm-mcard__who">
          <h3 className="gm-mcard__name">{name || 'Their name appears here'}</h3>
          <p className="gm-mcard__sub">
            {draft?.role ? <span className="gm-chip gm-chip--role">{draft.role}</span> : null}
            {draft?.organisation ? <span className="gm-mcard__org">{draft.organisation}</span> : null}
            {!draft?.role && !draft?.organisation ? <span className="gm-mcard__muted">Role &amp; organisation</span> : null}
          </p>
        </div>
      </div>

      {draft?.bio ? (
        <blockquote className="gm-mcard__bio">{draft.bio}</blockquote>
      ) : (
        <div className="gm-mcard__bio gm-mcard__bio--ghost">A line about them will sit here.</div>
      )}

      <dl className="gm-mcard__facts">
        <div className="gm-mcard__fact">
          <dt>Email</dt>
          <dd className={draft?.email ? '' : 'gm-mcard__muted'}>{draft?.email || 'not given yet'}</dd>
        </div>
        <div className="gm-mcard__fact">
          <dt>Directory</dt>
          <dd>
            <span className={`gm-dot ${listed ? 'gm-dot--on' : 'gm-dot--off'}`} aria-hidden="true" />
            {listed ? 'Listed publicly' : 'Not listed'}
          </dd>
        </div>
      </dl>

      <footer className="gm-mcard__foot">
        <div className="gm-mcard__meter" role="img" aria-label={`Profile ${Math.round(completeness * 100)}% complete`}>
          <span className="gm-mcard__meter-fill" style={{ width: `${Math.round(completeness * 100)}%` }} />
        </div>
        <span className="gm-mcard__meter-label">{Math.round(completeness * 100)}% complete</span>
      </footer>
    </article>
  );
}
