// The AngularJS host for the one AngularJS island in this region.
//
// The members search was extracted from a legacy AngularJS page and still IS AngularJS — motu
// mounts it as a custom element like any other island, but it needs a host scope to bind to. In the
// real legacy app that scope is the page's own controller. Here the app owns the field schema, so
// it provides it directly.
//
// THIS IS NOT LAGOON SCAFFOLDING. The lagoon has its own copy for the same reason and neither is
// the other's stand-in: the schema below is what THIS app's search offers, and if the two drift the
// lagoon is previewing a search the app does not have.
import angular from 'angular';
import { provideAngularHost } from '@motu/adapter-angularjs';
import { MEMBER_SEARCH_CONFIG } from 'demo-app/search-config';

// ONE SCHEMA, not two. This started as its own copy of the five fields and that is precisely the
// drift worth refusing: the island, the lagoon and the page would each have described the search
// separately, and nothing would have failed when one of them changed.
let installed = false;

export function setupAngularHost(): void {
  if (installed) return;
  installed = true;
  provideAngularHost({
    angular,
    configure: (mod: any) => {
      mod.run(['$rootScope', ($rootScope: any) => {
        $rootScope.search = {};
        $rootScope.hostSearchConfig = MEMBER_SEARCH_CONFIG;
      }]);
    },
  });
}
