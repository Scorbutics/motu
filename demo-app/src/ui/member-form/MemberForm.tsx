import { useEffect, useState } from 'react';
import type { MotuFit } from '@motu/core';
import { MEMBER_TIERS, type MemberDraft, type MemberTier } from '../../shared/member-draft.js';

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
export function MemberForm({ draft, chapters = [], fit, onDraftChanged, onReset }: MemberFormProps) {
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
    <form className="gm-card gm-form" onSubmit={(e) => e.preventDefault()} aria-label="Create a member">
      <header className="gm-form__head">
        <h2 className="gm-form__title">Create a member</h2>
        <p className="gm-form__hint">The card updates as you type.</p>
      </header>

      <label className="gm-field">
        <span className="gm-label">Full name</span>
        <input
          className="gm-input"
          value={local.fullName ?? ''}
          placeholder="Ada Lovelace"
          onChange={(e) => set('fullName', e.target.value)}
        />
      </label>

      <label className="gm-field">
        <span className="gm-label">Email</span>
        <input
          className="gm-input"
          type="email"
          value={local.email ?? ''}
          placeholder="ada@example.org"
          onChange={(e) => set('email', e.target.value)}
        />
      </label>

      <div className="gm-form__row">
        <label className="gm-field">
          <span className="gm-label">Tier</span>
          <select
            className="gm-input"
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

        <label className="gm-field">
          <span className="gm-label">Chapter</span>
          <input
            className="gm-input"
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

      <div className="gm-form__row">
        <label className="gm-field">
          <span className="gm-label">Member no.</span>
          <input
            className="gm-input"
            inputMode="numeric"
            value={local.memberNo ?? ''}
            placeholder="702506"
            onChange={(e) => set('memberNo', e.target.value)}
          />
        </label>

        <label className="gm-field">
          <span className="gm-label">Joined</span>
          <input
            className="gm-input"
            value={local.joined ?? ''}
            placeholder="01/09/2026"
            onChange={(e) => set('joined', e.target.value)}
          />
        </label>
      </div>

      <label className="gm-field">
        <span className="gm-label">Photo URL</span>
        <input
          className="gm-input"
          value={local.photo ?? ''}
          placeholder="leave empty to use initials"
          onChange={(e) => set('photo', e.target.value)}
        />
      </label>

      <div className="gm-form__actions">
        <button
          type="button"
          className="gm-btn gm-btn--ghost"
          onClick={() => {
            setLocal({});
            onReset?.();
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}
