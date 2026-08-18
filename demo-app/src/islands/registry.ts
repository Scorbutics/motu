// The project's element registry, assembled from each island's own `element.ts`. Adding an island =
// creating its folder (component + element.ts) and adding one row here. The framework
// (registerElements) turns this into custom-element registrations.

import type { ElementSpec } from '@motu/react';
import { companyLookupElement } from './company-lookup/element.js';
import { selectedCompanyElement } from './selected-company/element.js';
import { memberSearchNgElement } from './member-search-ng/element.js';
import { memberResultsElement } from './member-results/element.js';
import { memberFilterChipsElement } from './member-filter-chips/element.js';
import { memberActionsElement } from './member-actions/element.js';
import { memberHeaderElement } from './member-header/element.js';
import { userSearchElement } from './user-search/element.js';

export const ELEMENT_REGISTRY: ElementSpec[] = [
  companyLookupElement,
  selectedCompanyElement,
  memberSearchNgElement,
  memberResultsElement,
  memberFilterChipsElement,
  memberActionsElement,
  memberHeaderElement,
  userSearchElement,
];
