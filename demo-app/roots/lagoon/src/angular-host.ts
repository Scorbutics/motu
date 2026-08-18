// LAGOON-ONLY scaffolding: the standalone harness has no legacy app, so an extracted AngularJS island
// (e.g. member-search) would find no host scope to attach to and no search config/model to bind to.
// This gives motu a minimal AngularJS host (framework: provideAngularHost) carrying the same scope
// names the real page exposes — so the extracted island renders and is clickable offline. It is a
// preview stand-in; embedded (the real legacy page) uses the actual controller scope instead.
import angular from 'angular';
import { provideAngularHost } from '@motu/adapter-angularjs';

let installed = false;

/** Give the lagoon a minimal AngularJS host so extracted AngularJS islands render offline. */
export function setupLagoonAngularHost(): void {
  if (installed) return;
  installed = true;
  provideAngularHost({
    angular,
    configure: (mod: any) => {
      mod.run([
        '$rootScope',
        ($rootScope: any) => {
          // The host's own search model + field schema. `hostSearchConfig` is also the anchor the
          // island's `hostScopeKey` looks for, so this scope is the one it attaches to.
          $rootScope.search = {};
          $rootScope.hostSearchConfig = {
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
        },
      ]);
    },
  });
}
