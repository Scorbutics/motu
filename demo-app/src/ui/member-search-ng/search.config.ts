// Island-OWNED field config for the isolated search (MemberSearchNg). This is the seam: the island
// renders these fields (plain AngularJS ng-repeat + ng-model) against ITS OWN model (the store's
// `criteria`), never the legacy `search` model or the host controller's config. It is the fallback
// used whenever no `config` prop arrives.
//
// REAL APP: point the host channel at the app's own field schema (same shape: `fields[]` with
// name/label and optional `options[]`). The island's isolation does not depend on WHERE the config
// comes from, only that its model + emission go through the store, not the legacy scope.
export const MEMBER_SEARCH_CONFIG = {
  fields: [
    { name: 'email', label: 'Email' },
    { name: 'firstname', label: 'First name' },
    { name: 'surname', label: 'Last name' },
    {
      name: 'status',
      label: 'Status',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'suspended', label: 'Suspended' },
      ],
    },
    {
      name: 'plan',
      label: 'Plan',
      options: [
        { value: 'premium', label: 'Premium' },
        { value: 'standard', label: 'Standard' },
      ],
    },
  ],
};
