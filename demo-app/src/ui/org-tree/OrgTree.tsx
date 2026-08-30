import type { OrgChart, OrgDepartment } from '../../shared/org-types.js';

export interface OrgTreeProps {
  /** The company's departments, in tree order. Empty until a company is picked. */
  chart?: OrgChart;
  /** Which department is open. Held by the region, so a link or a flow can set it. */
  departmentId?: string | null;
  onDepartmentSelected?: (department: OrgDepartment) => void;
}

/**
 * The company's structure. It OWNS which department is open — the one key it writes — and knows
 * nothing about the people list, the person card or the headcount that all read that key.
 */
export function OrgTree({ chart = [], departmentId = null, onDepartmentSelected }: OrgTreeProps) {
  if (chart.length === 0) {
    return <div className="motu-note">Pick an organisation to see its structure.</div>;
  }
  return (
    <ul className="org-tree" aria-label="Departments">
      {chart.map((d) => (
        <li key={d.id} style={{ paddingLeft: `${d.depth * 16}px` }}>
          <button
            type="button"
            className="org-tree__row"
            aria-current={d.id === departmentId ? 'true' : 'false'}
            onClick={() => onDepartmentSelected?.(d)}
          >
            <span className="org-tree__name">{d.name}</span>
            <span className="org-tree__count">{d.people.length}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
