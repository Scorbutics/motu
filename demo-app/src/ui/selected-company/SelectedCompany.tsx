import type { CompanyRow } from '../company-lookup/CompanyLookup.js';

export interface SelectedCompanyProps {
  company?: CompanyRow | null;
}

function label(row: CompanyRow): string {
  for (const key of ['name', 'label', 'companyName', 'description']) {
    const v = row[key];
    if (typeof v === 'string') return v;
  }
  const first = Object.values(row).find((v) => typeof v === 'string');
  return (first as string) ?? JSON.stringify(row);
}

/**
 * A second, deliberately trivial island. It renders whatever company it is given via its `company`
 * property. In an archipelago it is fed by the shared store — it never talks to the lookup island
 * directly, and the legacy page carries no wiring between them.
 */
export function SelectedCompany({ company }: SelectedCompanyProps) {
  if (!company) {
    return <div className="motu-note">No organisation selected yet.</div>;
  }
  return (
    <div className="motu-selected">
      Selected via archipelago store: <strong>{label(company)}</strong>
    </div>
  );
}
