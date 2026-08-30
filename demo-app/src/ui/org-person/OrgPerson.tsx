import type { OrgDepartment, OrgPerson as Person } from '../../shared/org-types.js';

export interface OrgPersonProps {
  person?: Person | null;
  /** Where they sit. A SECOND key this card reads, and the reason it is worth drawing: the card is
   *  wrong if the two disagree, which is exactly what a shared-state bug looks like. */
  department?: OrgDepartment | null;
}

/** One person, and the department they were found in. Writes nothing. */
export function OrgPerson({ person = null, department = null }: OrgPersonProps) {
  if (!person) {
    return <div className="motu-note">No one selected.</div>;
  }
  return (
    <div className="org-person">
      <div className="org-person__name">{person.name}</div>
      <div className="org-person__role">{person.role}</div>
      {department ? <div className="org-person__dept">{department.name}</div> : null}
      <a className="org-person__mail" href={`mailto:${person.email}`}>{person.email}</a>
    </div>
  );
}
