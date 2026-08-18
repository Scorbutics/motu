import { CRITERIA_LABELS, criteriaDisplay, type MemberCriteria } from '../../shared/member-types.js';

export interface MemberFilterChipsProps {
  criteria?: MemberCriteria;
  onCriteriaChanged?: (criteria: MemberCriteria) => void;
}

/**
 * Active-filter chips. Binds `criteria` from the shared store and emits `criteria-changed` when a
 * chip is removed — a modern, low-friction way to see and clear what's applied.
 */
export function MemberFilterChips({ criteria, onCriteriaChanged }: MemberFilterChipsProps) {
  const entries = Object.entries(criteria ?? {}).filter(
    ([, v]) => typeof v === 'string' && v.trim() !== '',
  ) as [keyof MemberCriteria, string][];

  if (entries.length === 0) return null;

  const remove = (key: keyof MemberCriteria) => {
    const next = { ...(criteria ?? {}) };
    delete next[key];
    onCriteriaChanged?.(next);
  };

  return (
    <div className="gm-chips">
      {entries.map(([key, value]) => (
        <span className="gm-chip" key={key}>
          <span className="gm-chip__key">{CRITERIA_LABELS[key]}:</span>
          {criteriaDisplay(key, value)}
          <button
            type="button"
            className="gm-chip__x"
            aria-label={`Remove ${CRITERIA_LABELS[key]} filter`}
            onClick={() => remove(key)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
