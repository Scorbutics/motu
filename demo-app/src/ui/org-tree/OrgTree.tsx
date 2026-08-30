import type { OrgChart, OrgDepartment } from '../../shared/org-types.js';

export interface OrgTreeProps {
  /** The company's departments, in tree order. Empty until a company is picked. */
  chart?: OrgChart;
  /**
   * The open department itself, not a mirrored id.
   *
   * An `id` key beside the object it identifies is a second copy of one fact: two keys to keep in
   * step, and a graph that shows one reader each instead of the coupling that is really there.
   */
  department?: OrgDepartment | null;
  /** Whose structure this is — the same label the headcount reads. */
  companyLabel?: string;
  onDepartmentSelected?: (department: OrgDepartment) => void;
}

/**
 * The company's structure. It OWNS which department is open — the one key it writes — and knows
 * nothing about the people list, the person card or the headcount that all read that key.
 */
export function OrgTree({ chart = [], department = null, companyLabel = '', onDepartmentSelected }: OrgTreeProps) {
  if (chart.length === 0) {
    return <div className="motu-note">Pick an organisation to see its structure.</div>;
  }
  return (
    <>
      {companyLabel ? <div className="org-tree__company">{companyLabel}</div> : null}
      <ul className="org-tree" aria-label="Departments">
        {chart.map((d) => (
          <li key={d.id} style={{ paddingLeft: `${d.depth * 16}px` }}>
          <button
            type="button"
            className="org-tree__row"
            aria-current={d.id === department?.id ? 'true' : 'false'}
            onClick={() => onDepartmentSelected?.(d)}
          >
            <span className="org-tree__name">{d.name}</span>
            <span className="org-tree__count">{d.people.length}</span>
          </button>
        </li>
        ))}
      </ul>
    </>
  );
}
