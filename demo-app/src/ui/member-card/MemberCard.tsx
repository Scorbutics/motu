import type { MotuFit } from '@motujs/core';
import { initialsOf, type MemberDraft } from '../../shared/member-draft.js';
import { rankOf, xpForLevel } from '../../shared/gamification.js';
import { chapterColor, CLUB_NAME, GemIcon, grouped, PeopleIcon } from '../club/club-bits.js';

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

function Avatar({ draft }: { draft: MemberDraft | undefined }) {
  const initials = initialsOf(draft?.fullName);
  return (
    <span className="cl-mcard__ava" aria-hidden="true">
      {draft?.photo ? <img src={draft.photo} alt="" loading="lazy" /> : initials || '·'}
    </span>
  );
}

function Field({ label, value, empty, wide }: { label: string; value?: string; empty: string; wide?: boolean }) {
  const v = value?.trim();
  return (
    <div className={`cl-mcard__field${wide ? ' cl-mcard__field--wide' : ''}`}>
      <span className="cl-label">{label}</span>
      <span className={`cl-mcard__value${v ? '' : ' cl-mcard__value--empty'}`}>{v || empty}</span>
    </div>
  );
}

/**
 * The membership card, in the club's design.
 *
 * The PLAN picks the card's band — gold for premium, teal for standard — the same two colours the
 * plan takes everywhere else in the club. And a card being drafted is a member who has not joined
 * yet, so it shows where every member starts in the club's game: LEVEL 1, 0 XP, a rookie with the
 * whole bar ahead (`gamification.ts` — XP starts on the joining day).
 *
 * Everything is a function of one region key plus its own display props, so there is no second
 * source of truth to drift — and every field has a resting state, because the island must render
 * from defaults alone and an empty card is the first thing anyone sees.
 */
export function MemberCard({ draft, loading = false, showActions = false, layout = 'card', fit }: MemberCardProps) {
  void fit;
  const tier = draft?.tier ?? 'premium';
  const name = draft?.fullName?.trim();
  const chapter = draft?.chapter?.trim();
  const premium = tier === 'premium';

  if (loading) {
    return (
      <article className={`cl-mcard cl-mcard--${tier}`} aria-busy="true" aria-label="Loading member">
        <div className="cl-mcard__band">
          <span className="cl-lg cl-mcard__brand">{CLUB_NAME}</span>
        </div>
        <div className="cl-mcard__body">
          <div className="cl-mcard__who">
            <span className="cl-mcard__ava" />
            <span style={{ flex: 1, display: 'grid', gap: 8 }}>
              <span className="cl-skel" style={{ width: '60%', height: 18 }} />
              <span className="cl-skel" style={{ width: '40%' }} />
            </span>
          </div>
          <span className="cl-skel" style={{ height: 36 }} />
          <span className="cl-skel" style={{ height: 36 }} />
        </div>
      </article>
    );
  }

  if (layout === 'row') {
    return (
      <article className="cl-mcard-row" aria-label={name ? `${name}, ${tier}` : 'Member'}>
        <Avatar draft={draft} />
        <span className="cl-mcard-row__who">
          <strong>{name || 'Unnamed member'}</strong>
          <span>{chapter || 'No chapter yet'}</span>
        </span>
        <span className={`cl-lg cl-pill cl-pill--${tier}`}>{premium ? 'Premium' : 'Standard'}</span>
        <span className="cl-date">{draft?.memberNo || '—'}</span>
      </article>
    );
  }

  return (
    <article className={`cl-mcard cl-mcard--${tier}${name ? '' : ' cl-mcard--empty'}`} aria-label="Member card">
      <div className="cl-mcard__band">
        <span className="cl-lg cl-mcard__brand">
          <PeopleIcon size={20} />
          {CLUB_NAME}
        </span>
        <span className="cl-lg cl-mcard__pill">
          {premium ? (
            <>
              <GemIcon /> Premium
            </>
          ) : (
            'Standard'
          )}
        </span>
      </div>

      <div className="cl-mcard__body">
        <div className="cl-mcard__who">
          <Avatar draft={draft} />
          <span style={{ minWidth: 0 }}>
            <h3 className="cl-lg cl-mcard__name">{name || 'Their name appears here'}</h3>
            <p className="cl-mcard__chapter">
              {chapter ? <span className="cl-chap__dot" aria-hidden="true" style={{ background: chapterColor(chapter) }} /> : null}
              {chapter || 'No chapter yet'}
            </p>
          </span>
        </div>

        {/* WHERE THE GAME STARTS: a new member is level 1, with no XP until their first day. */}
        <div className="cl-mcard__xp">
          <span className="cl-lg">Lv 1</span>
          <div className="cl-bar" role="progressbar" aria-label="Level 1, 0 XP" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
            <span style={{ width: '0%' }} />
          </div>
          <small>0 / {grouped(xpForLevel(2))} XP · {rankOf(1)}</small>
        </div>

        <div className="cl-mcard__fields">
          <Field label="Email" value={draft?.email} empty="not given yet" wide />
          <Field label="Joined" value={draft?.joined} empty="—" />
          <Field label="Member no." value={draft?.memberNo} empty="—" />
        </div>

        {showActions ? (
          <div className="cl-mcard__actions">
            <button type="button" className="cl-btn cl-btn--red cl-lg">
              View profile
            </button>
            <button type="button" className="cl-btn cl-btn--plain cl-lg">
              Message
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
