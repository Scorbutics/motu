import { useEffect, useState } from 'react';
import type { MotuFit } from '@motujs/core';
import { MEMBER_TIERS, type MemberDraft, type MemberTier } from '../../shared/member-draft.js';
import { CHAPTER_COLORS } from '../club/club-bits.js';

/** The club's chapters, offered when the host supplies none — the list was empty on every page. */
const CLUB_CHAPTERS = Object.keys(CHAPTER_COLORS);

export interface MemberFormProps {
  /** Bound from the region, so the form stays in step with anything else that resets the draft. */
  draft?: MemberDraft;
  /** Chapters to choose from. Supplied by the host; the island renders fine with none. */
  chapters?: string[];
  /** Injected footprint, for the fit axis. This island is CSS-only, so it is accepted and unused. */
  fit?: MotuFit;
  onDraftChanged?: (draft: MemberDraft) => void;
  onReset?: () => void;
}

/**
 * "Create a member" — the form half of the Users page.
 *
 * IT PUBLISHES A DRAFT AND DRAWS NOTHING ELSE. Every keystroke emits the whole draft, which is what
 * makes the card beside it live: the coupling is one declared key, not a callback between two
 * components that would then have to know about each other.
 *
 * It holds its own copy while typing so the inputs stay responsive, and re-syncs when the bound draft
 * changes underneath it (a reset elsewhere, a seeded state in the lagoon). Rendering from defaults
 * alone is the rule that makes the empty state a designed thing rather than an accident.
 */
export function MemberForm({ draft, chapters = CLUB_CHAPTERS, fit, onDraftChanged, onReset }: MemberFormProps) {
  void fit;
  const [local, setLocal] = useState<MemberDraft>(draft ?? {});
  // The BOUND draft is the truth. Typing updates the local copy and publishes; anything that changes
  // the key from outside (a reset, a lagoon scenario) lands here and wins.
  useEffect(() => setLocal(draft ?? {}), [draft]);

  const set = <K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    onDraftChanged?.(next);
  };

  return (
    <form className="cl-form" onSubmit={(e) => e.preventDefault()} aria-label="Create a member">
      <header className="cl-form__head">
        <h2 className="cl-lg">Create a member</h2>
        <p>The card updates as you type.</p>
      </header>

      <label>
        <span className="cl-label">Full name</span>
        <input
          className="cl-input"
          value={local.fullName ?? ''}
          placeholder="Ada Lovelace"
          onChange={(e) => set('fullName', e.target.value)}
        />
      </label>

      <label>
        <span className="cl-label">Email</span>
        <input
          className="cl-input"
          type="email"
          value={local.email ?? ''}
          placeholder="ada@example.org"
          onChange={(e) => set('email', e.target.value)}
        />
      </label>

      <div className="cl-form__row">
        <label>
          <span className="cl-label">Plan</span>
          <select
            className="cl-input"
            value={local.tier ?? 'premium'}
            onChange={(e) => set('tier', e.target.value as MemberTier)}
          >
            {MEMBER_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier[0]!.toUpperCase() + tier.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="cl-label">Chapter</span>
          <input
            className="cl-input"
            list="gm-chapters"
            value={local.chapter ?? ''}
            placeholder="South chapter"
            onChange={(e) => set('chapter', e.target.value)}
          />
          <datalist id="gm-chapters">
            {chapters.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="cl-form__row">
        <label>
          <span className="cl-label">Member no.</span>
          <input
            className="cl-input"
            inputMode="numeric"
            value={local.memberNo ?? ''}
            // AFTER THE SEED'S LAST NUMBER (702739). The placeholder used to be 702506 — Rich Stroustrup's —
            // and member numbers are unique: it suggested a number nobody can be given.
            placeholder="702740"
            onChange={(e) => set('memberNo', e.target.value)}
          />
        </label>

        <label>
          <span className="cl-label">Joined</span>
          <input
            className="cl-input"
            value={local.joined ?? ''}
            placeholder="dd/mm/yyyy"
            onChange={(e) => set('joined', e.target.value)}
          />
        </label>
      </div>

      <label>
        <span className="cl-label">Photo URL</span>
        <input
          className="cl-input"
          value={local.photo ?? ''}
          placeholder="leave empty to use initials"
          onChange={(e) => set('photo', e.target.value)}
        />
      </label>

      <div className="cl-form__actions">
        <button
          type="button"
          className="cl-btn cl-btn--plain cl-lg"
          onClick={() => {
            setLocal({});
            onReset?.();
          }}
        >
          Clear
        </button>
        {/* SAID, NOT HIDDEN: the form is titled "Create a member", and nothing here can create one —
            this demo has no backend to write to. The same honesty as the bulk bar's Change plan. */}
        <button type="submit" className="cl-btn cl-btn--red cl-lg" disabled title="Members cannot be created in this demo: there is no backend to write to">
          Save member
        </button>
      </div>
    </form>
  );
}
