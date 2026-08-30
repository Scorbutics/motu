import type { OrgChart, OrgDepartment } from '../../shared/org-types.js';

export interface OrgHeadcountProps {
  chart?: OrgChart;
  /** The open department, for the second figure. Read, never written. */
  department?: OrgDepartment | null;
  companyLabel?: string;
}

/**
 * The two numbers the screen is really about. Reads BOTH the chart and the open department, so it is
 * the island that proves the two keys move together — a summary that keeps counting the last
 * company's people is the quiet failure this whole region exists to make visible.
 */
export function OrgHeadcount({ chart = [], department = null, companyLabel = '' }: OrgHeadcountProps) {
  const total = chart.reduce((n, d) => n + d.people.length, 0);
  return (
    <div className="org-headcount">
      <div className="org-headcount__stat">
        <b>{total}</b>
        <span>{companyLabel ? `in ${companyLabel}` : 'people'}</span>
      </div>
      <div className="org-headcount__stat">
        <b>{department ? department.people.length : '—'}</b>
        <span>{department ? `in ${department.name}` : 'no department open'}</span>
      </div>
      <div className="org-headcount__stat">
        <b>{chart.length}</b>
        <span>departments</span>
      </div>
    </div>
  );
}
