import { useEffect, useRef, useState } from 'react';
import type { MemberCriteria } from '../../shared/member-types.js';

export interface MemberQuickSearchProps {
  /** The region's filters. The box shows `q` from it, and keeps every other filter when it changes `q`. */
  criteria?: MemberCriteria;
  onCriteriaChanged?: (criteria: MemberCriteria) => void;
}

/** How long typing must pause before the search is sent, in ms. */
const DEBOUNCE_MS = 250;

/**
 * "Search name or email" — one box over the members table.
 *
 * It edits ONE field of the region's `criteria`, `q`, which every port reads as "first name, surname
 * or email contains each word" — so "grace allen" finds Grace Allen in the sandbox, the lagoon and
 * Postgres alike. A plan picked in the tabs survives a search, and a search survives a plan.
 *
 * Typing is local until it pauses: a fetch per keystroke would race its own answers and flicker the
 * table, and the region only needs the term a person meant.
 */
export function MemberQuickSearch({ criteria, onCriteriaChanged }: MemberQuickSearchProps) {
  const external = criteria?.q ?? '';
  const [term, setTerm] = useState(external);
  const sent = useRef(external);
  const latest = useRef(criteria);
  latest.current = criteria;

  // Follow the region when SOMEONE ELSE changes the term (a reset, a seeded state in the lagoon).
  useEffect(() => {
    if (external !== sent.current) {
      sent.current = external;
      setTerm(external);
    }
  }, [external]);

  useEffect(() => {
    if (term.trim() === sent.current.trim()) return;
    const t = setTimeout(() => {
      sent.current = term;
      const next: MemberCriteria = { ...(latest.current ?? {}) };
      if (term.trim()) next.q = term.trim();
      else delete next.q;
      onCriteriaChanged?.(next);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term, onCriteriaChanged]);

  return (
    <div className="cl-search" role="search">
      <label htmlFor="member-search" className="cl-sr">
        Search members
      </label>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cl-muted)" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l5 5" />
      </svg>
      <input
        id="member-search"
        type="search"
        placeholder="Search name or email"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends now, without waiting for the pause.
          if (e.key === 'Enter') {
            sent.current = term;
            const next: MemberCriteria = { ...(latest.current ?? {}) };
            if (term.trim()) next.q = term.trim();
            else delete next.q;
            onCriteriaChanged?.(next);
          }
        }}
      />
    </div>
  );
}
