// Org lookup: pick a company, then drill into its structure.
//
// FIVE ISLANDS AND NO WIRING. The tree does not know the people list exists; the person card does
// not know who picked the person. Every line between them is a region key, and the page places the
// islands without ever naming one to another — which is why this file has nothing in it but layout.
import { Admin } from '../motu/admin-region.js';

/** The region read back: which company is open, if any. */
function OrgStatus() {
  const region = Admin.useRegion();
  const label = typeof region.companyLabel === 'string' ? region.companyLabel : '';
  return <footer className="app__footer">{label ? `Showing ${label}` : 'Pick a company to see its structure'}</footer>;
}

export function OrgPage() {
  return (
    <Admin.Region>
      <div className="app__page motu-root" data-motu-theme="motu">
        <Admin.Island slot="company-lookup" />
        <Admin.Island slot="selected-company" />
        <Admin.Island slot="org-headcount" />
        <div className="app__split">
          <Admin.Island slot="org-tree" />
          <div className="app__stack">
            <Admin.Island slot="org-people" />
            <Admin.Island slot="org-person" />
          </div>
        </div>
        <OrgStatus />
      </div>
    </Admin.Region>
  );
}
