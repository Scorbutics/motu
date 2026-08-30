// ORG LOOKUP — a company, its structure, and the people in it.
//
// A DRILL-DOWN, which is the shape this region was missing. It used to be a lookup and a card: one
// shared key, one reader, nothing an archipelago is needed for. What makes a region worth declaring
// is a key several islands read and exactly one writes, and this screen has three of them:
//
//   selectedCompany     written by x-company-lookup   read by selected-company, headcount
//   chart               HOST-WRITTEN (answered below) read by org-tree, headcount
//   selectedDepartment  written by x-org-tree         read by org-people, org-person, headcount
//   selectedPerson      written by x-org-people       read by org-person
//
// Nothing here is wired island-to-island. The tree does not know the people list exists; the card
// does not know who picked the person. That is the whole claim, and the coupling graph is what makes
// it visible — every line on it is a key, not a call.
import type { ArchipelagoConfig } from '@motu/core';
import { orgChartFor, companyName, type OrgDepartment } from '../../shared/org-types.js';
import { ADMIN_LAYOUT } from './admin.layout.js';

export const adminArchipelago: ArchipelagoConfig = {
  id: 'admin',
  layout: ADMIN_LAYOUT,
  islands: [
    {
      slot: 'company-lookup',
      element: 'x-company-lookup',
      on: {
        // THE HOST ANSWERING, which is what a page does and what a `channel` will do once there is a
        // backend for it: picking a company replaces the chart under it.
        //
        // AND CLEARS THE DRILL-DOWN. A department id from the company you just left still matches
        // nothing, so the people list would empty while the card kept showing somebody from the
        // previous org — a screen that is wrong while every island in it is behaving.
        'company-selected': (detail, { store }) => {
          store.set('selectedCompany', detail);
          store.set('chart', orgChartFor(detail as Record<string, unknown>));
          store.set('companyLabel', companyName(detail as Record<string, unknown>));
          store.set('selectedDepartment', null);
          store.set('selectedPerson', null);
        },
      },
    },
    {
      slot: 'selected-company',
      element: 'x-selected-company',
      bind: { company: 'selectedCompany' },
    },
    {
      slot: 'org-headcount',
      element: 'x-org-headcount',
      // THREE KEYS, NO WRITES. The island that proves the others move together.
      bind: { chart: 'chart', department: 'selectedDepartment', companyLabel: 'companyLabel' },
    },
    {
      slot: 'org-tree',
      element: 'x-org-tree',
      bind: { chart: 'chart', departmentId: 'selectedDepartmentId' },
      on: {
        'department-selected': (detail, { store }) => {
          const department = detail as OrgDepartment;
          store.set('selectedDepartment', department);
          store.set('selectedDepartmentId', department?.id ?? null);
          // Opening a different department drops the person, for the same reason as above: they are
          // not in the department that is now open.
          store.set('selectedPerson', null);
        },
      },
    },
    {
      slot: 'org-people',
      element: 'x-org-people',
      bind: { department: 'selectedDepartment', personId: 'selectedPersonId' },
      on: {
        'person-selected': (detail, { store }) => {
          const person = detail as { id?: string };
          store.set('selectedPerson', person);
          store.set('selectedPersonId', person?.id ?? null);
        },
      },
    },
    {
      slot: 'org-person',
      element: 'x-org-person',
      bind: { person: 'selectedPerson', department: 'selectedDepartment' },
    },
  ],
};
