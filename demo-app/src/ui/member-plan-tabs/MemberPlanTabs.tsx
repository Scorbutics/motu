import type { ClubOverview } from '../../shared/gamification.js';
import type { MemberCriteria } from '../../shared/member-types.js';

export interface MemberPlanTabsProps {
  /** The region's filters. The tabs light the plan in it, and keep every other filter when they change it. */
  criteria?: MemberCriteria;
  /** For the counts beside each tab — the whole club's, not the current page's. */
  overview?: ClubOverview;
  onCriteriaChanged?: (criteria: MemberCriteria) => void;
}

type Plan = 'all' | 'standard' | 'premium';

/**
 * All · Standard · Premium — the plan filter as three tabs over the table.
 *
 * The same `criteria.plan` the Filters panel sets and the chips show: three controls, one fact, and a
 * change from any of them reaches the other two through the region. Picking a tab replaces only the
 * plan, so a search typed elsewhere survives it.
 */
export function MemberPlanTabs({ criteria, overview, onCriteriaChanged }: MemberPlanTabsProps) {
  const current: Plan = criteria?.plan === 'premium' ? 'premium' : criteria?.plan === 'standard' ? 'standard' : 'all';
  const tabs: [Plan, string, number | undefined][] = [
    ['all', 'All', overview?.members],
    ['standard', 'Standard', overview?.standard],
    ['premium', 'Premium', overview?.premium],
  ];
  const pick = (plan: Plan) => {
    if (plan === current) return;
    const next: MemberCriteria = { ...(criteria ?? {}) };
    if (plan === 'all') delete next.plan;
    else next.plan = plan;
    onCriteriaChanged?.(next);
  };
  return (
    <div className="cl-tabs" role="group" aria-label="Filter by plan">
      {tabs.map(([plan, label, count]) => {
        const on = plan === current;
        return (
          <button
            key={plan}
            type="button"
            className={`cl-btn cl-lg cl-tab ${on ? 'cl-tab--on' : 'cl-btn--plain'}`}
            aria-pressed={on}
            onClick={() => pick(plan)}
          >
            {label} {count !== undefined ? <small>{count}</small> : null}
          </button>
        );
      })}
    </div>
  );
}
