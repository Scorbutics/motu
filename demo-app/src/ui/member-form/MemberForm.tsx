import { useEffect, useState } from 'react';
import type { MotuFit } from '@motu/core';
import { MEMBER_ROLES, type MemberDraft, type MemberRole } from '../../shared/member-draft.js';

export interface MemberFormProps {
  /** Bound from the region, so the form stays in step with anything else that resets the draft. */
  draft?: MemberDraft;
  /** Organisations to choose from. Supplied by the host; the island renders fine with none. */
  organisations?: string[];
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
export function MemberForm({ draft, organisations = [], fit, onDraftChanged, onReset }: MemberFormProps) {
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
          <span className="gm-label">Role</span>
          <select
            className="gm-input"
            value={local.role ?? ''}
            onChange={(e) => set('role', (e.target.value || undefined) as MemberRole | undefined)}
          >
            <option value="">Choose…</option>
            {MEMBER_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label className="gm-field">
          <span className="gm-label">Organisation</span>
          <input
            className="gm-input"
            list="gm-orgs"
            value={local.organisation ?? ''}
            placeholder="Analytical Engines"
            onChange={(e) => set('organisation', e.target.value)}
          />
          <datalist id="gm-orgs">
            {organisations.map((org) => (
              <option key={org} value={org} />
            ))}
          </datalist>
        </label>
      </div>

      <label className="gm-field">
        <span className="gm-label">A line about them</span>
        <textarea
          className="gm-input gm-input--area"
          rows={2}
          value={local.bio ?? ''}
          placeholder="Writes the first program, argues with Babbage."
          onChange={(e) => set('bio', e.target.value)}
        />
      </label>

      <label className="gm-check">
        <input type="checkbox" checked={local.listed ?? false} onChange={(e) => set('listed', e.target.checked)} />
        <span>List them in the member directory</span>
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
