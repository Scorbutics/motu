// The org-lookup region's binding. motu plus the region's own declaration, nothing else.
import { createRegion } from '@motu/react';
import { adminArchipelago } from 'demo-app/archipelagos/admin';
import { ELEMENT_REGISTRY } from 'demo-app';

export const Admin = createRegion(adminArchipelago, {
  elements: ELEMENT_REGISTRY,
  // THE RESTING STATE OF EVERY HOST-WRITTEN KEY. All five are set by the archipelago's
  // `company-selected` handler and by nothing else, so before anyone picks a company each reader
  // sees `undefined` — and `undefined` is not the same as "no company selected" to a component that
  // distinguishes them. The lagoon cannot catch this because a preview seeds its own keys; the page
  // is the only place the empty screen actually happens.
  seed: {
    selectedCompany: null,
    // `[]`, NOT `null`. The chart is a list of departments and the islands reduce over it; seeding
    // the "nothing yet" state as null crashed `org-headcount` and `org-tree` on first paint. The
    // empty value of a list is the empty list — which is also what makes the resting screen render
    // the same way the lagoon's does.
    chart: [],
    companyLabel: '',
    selectedDepartment: null,
    selectedPerson: null,
  },
});
