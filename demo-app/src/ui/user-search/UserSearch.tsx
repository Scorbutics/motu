import { useEffect, useState } from 'react';
import type { MotuFit } from '@motu/core';

/** Search criteria for the Users page, mirroring the legacy `user-search` schema (name/org/role). */
export interface UserCriteria {
  /** "Email (contains)" — a substring match on the user's email. */
  name?: string;
  /** Opaque organisation id (the value behind the Organisation lookup). */
  company?: string;
  /** One of the role enum values below. */
  role?: string;
}

/**
 * An option for the Organisation lookup. The host/archipelago supplies these (a lookup is not the
 * search box's concern) — the island stays mode-agnostic and renders fine with none.
 */
export interface CompanyOption {
  id: string;
  name: string;
}

export interface UserSearchProps {
  /** Bound from the shared store so the fields stay in sync with resets elsewhere. */
  criteria?: UserCriteria;
  /** Organisation options for the lookup (default: none → the select just offers "Any"). */
  companies?: CompanyOption[];
  /** Injected footprint. Accepted for the fit axis; this island is CSS-only ('fill'), so it's unused. */
  fit?: MotuFit;
  onCriteriaChanged?: (criteria: UserCriteria) => void;
  onReset?: () => void;
}

/** Role enum + human titles, mirroring the legacy `user-search-schema.json` (values anonymised). */
const ROLES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'VOLUNTEER', label: 'Volunteer' },
  { value: 'INSTRUCTOR', label: 'Instructor' },
  { value: 'COORDINATOR', label: 'Coordinator' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'GUEST', label: 'Guest' },
];

function prune(c: UserCriteria | undefined): UserCriteria {
  const out: UserCriteria = {};
  for (const [k, v] of Object.entries(c ?? {})) {
    if (typeof v === 'string' && v.trim() !== '') out[k as keyof UserCriteria] = v;
  }
  return out;
}

/**
 * The Users "Search" box, extracted from the legacy AngularJS `userController` + `user.html`
 * (a schema-driven form over the `user-search` schema). Mode-agnostic: it holds a draft of the search
 * criteria and emits `criteria-changed` / `reset` — it never fetches (the Users results list is a
 * separate island that self-fetches by criteria). Company lookup options come in as a prop, so the
 * island renders correctly from its defaults alone in the lagoon.
 */
export function UserSearch({
  criteria,
  companies = [],
  fit = 'native',
  onCriteriaChanged,
  onReset,
}: UserSearchProps = {}) {
  const [draft, setDraft] = useState<UserCriteria>(criteria ?? {});
  const externalJson = JSON.stringify(prune(criteria));

  useEffect(() => {
    setDraft(criteria ?? {});
  }, [externalJson]);

  const set = (key: keyof UserCriteria, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = () => onCriteriaChanged?.(prune(draft));
  const reset = () => {
    setDraft({});
    onReset?.();
  };

  const fields = (
    <>
      <label className="gm-field">
        <span className="gm-label">Email (contains)</span>
        <input
          className="gm-input"
          type="text"
          maxLength={128}
          value={draft.name ?? ''}
          onChange={(e) => set('name', e.target.value)}
          aria-label="Email contains"
        />
      </label>
      <label className="gm-field">
        <span className="gm-label">Organisation</span>
        <select
          className="gm-select"
          value={draft.company ?? ''}
          onChange={(e) => set('company', e.target.value)}
          aria-label="Organisation"
        >
          <option value="">Any</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="gm-field">
        <span className="gm-label">Role</span>
        <select
          className="gm-select"
          value={draft.role ?? ''}
          onChange={(e) => set('role', e.target.value)}
          aria-label="Role"
        >
          <option value="">Any</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  // The legacy Users page shows an always-expanded titled "Search" rail in both footprints; `fit`
  // only tunes chrome via CSS, so there's one DOM branch and one source of field state.
  void fit;
  return (
    <form
      className="gm-panel gm-searchrail"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="gm-panel__head">
        <h2>Search</h2>
      </div>
      <div className="gm-panel__body">{fields}</div>
      <div className="gm-searchrail__foot">
        <button type="button" className="gm-btn gm-btn--primary" onClick={submit}>
          Search
        </button>
        <button type="button" className="gm-btn" onClick={reset}>
          Reset
        </button>
      </div>
    </form>
  );
}
