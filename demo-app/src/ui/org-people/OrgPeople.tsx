import type { OrgDepartment, OrgPerson } from '../../shared/org-types.js';

export interface OrgPeopleProps {
  /** The open department. Read from the region — this island never picks it. */
  department?: OrgDepartment | null;
  personId?: string | null;
  onPersonSelected?: (person: OrgPerson) => void;
}

/** Who is in the open department. Owns the selected person, reads the department it was given. */
export function OrgPeople({ department = null, personId = null, onPersonSelected }: OrgPeopleProps) {
  if (!department) {
    return <div className="motu-note">Pick a department to see who is in it.</div>;
  }
  return (
    <ul className="org-people" aria-label={`People in ${department.name}`}>
      {department.people.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className="org-people__row"
            aria-current={p.id === personId ? 'true' : 'false'}
            onClick={() => onPersonSelected?.(p)}
          >
            <span className="org-people__name">{p.name}</span>
            <span className="org-people__role">{p.role}</span>
            {p.lead ? <span className="org-people__lead">lead</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
