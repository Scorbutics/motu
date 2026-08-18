// MemberSearchNg — the isolated ("island") successor to the adopted legacy search. Plain AngularJS
// (no form-widget library), seam-isolated on the DATA axis, not the DOM axis (light):
//   - input:  the store's `criteria` + `config` (motu props) — criteria copied into its OWN draft
//             model; config is the field SCHEMA the template renders with ng-repeat (embedded: the
//             host's own hostSearchConfig, mirrored in by a host channel; lagoon / no config: the
//             island's own MEMBER_SEARCH_CONFIG).
//   - output: `criteria-changed` (auto, debounced) + `reset` — written to the store
// It never touches the legacy `search` model or reaches into the host scope: config arrives as a prop
// (the coupling lives in the composition-root channel), so the island stays host-agnostic.
import type { AngularElementSpec } from '@motu/adapter-angularjs';
import template from './member-search-ng.html?raw';
import { MEMBER_SEARCH_CONFIG } from './search.config.js';

// Drag-to-dismiss for the mobile Filters bottom sheet. Installed ONCE (a single delegated document
// listener serves any member-search sheet); it resolves the island's scope from the dragged sheet's
// DOM, so it needs no per-instance element ref (the controller only gets $scope, not $element). Grab
// the handle, drag down, release past a threshold to close — else it snaps back. Mobile-only.
let sheetDragInstalled = false;
function installSheetDrag(angular: any): void {
  if (sheetDragInstalled || typeof document === 'undefined') return;
  sheetDragInstalled = true;
  let sheet: HTMLElement | null = null;
  let startY = 0;
  let dy = 0;
  const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

  document.addEventListener('pointerdown', (e: any) => {
    const handle = e.target?.closest?.('.gm-sheet-handle');
    if (!handle || !isMobile()) return;
    sheet = handle.closest('.gm-popover');
    if (!sheet) return;
    startY = e.clientY;
    dy = 0;
    sheet.style.transition = 'none'; // follow the finger 1:1 during the drag
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e: any) => {
    if (!sheet) return;
    dy = Math.max(0, e.clientY - startY); // down only
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const release = () => {
    if (!sheet) return;
    const el = sheet;
    sheet = null;
    const dismiss = dy > Math.min(140, (el.getBoundingClientRect().height || 1) * 0.3);
    if (dismiss) {
      // Close via the sheet's OWN backdrop ng-click (vm.open = false) rather than
      // angular.element(el).scope(), which returns undefined when the host disables debug info
      // ($compileProvider.debugInfoEnabled(false) — the production console app): there the drag moved
      // but never closed. ngClick runs a digest synchronously, so the --open class is gone before the
      // transform is handed back below (no jump).
      const backdrop = el.parentElement && el.parentElement.querySelector('.gm-popover-backdrop');
      if (backdrop) (backdrop as HTMLElement).click();
      else {
        const scope = angular.element(el).scope();
        if (scope && scope.vm) {
          scope.vm.open = false;
          scope.$applyAsync();
        }
      }
    }
    // Hand the transform back to the CSS class and restore its transition: dismiss animates dy ->
    // translateY(100%) (open is now false); snap-back animates dy -> translateY(0) (still open).
    el.style.transition = '';
    el.style.transform = '';
    dy = 0;
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
}

export const memberSearchNgAngular: AngularElementSpec = {
  template,
  controllerAs: 'vm',
  // Runs as a non-isolate child of the host member scope so host-provided search state (the field
  // schema and anything the host hangs beside it) resolves up the chain. The host-scope reach
  // (mechanism + the names it pulls in) is DECLARED in element.ts `contract.coupling`, not here — this file is pure
  // render (template + controller). The island's own `draft` model still flows to the store.
  // Array DI annotation — the bridge bundle is minified, so injectables must be named explicitly.
  controller: [
    '$scope',
    '$timeout',
    function (this: any, $scope: any, $timeout: any) {
      const angular = (window as any).angular;
      const vm = this;
      installSheetDrag(angular); // once: wires drag-to-dismiss for the mobile bottom sheet
      // Render the fields only once a config is resolved (vm.fieldsReady). `config` is a motu prop fed
      // from the store, so this reacts when the composition-root channel mirrors the host's schema in.
      // A config carrying `fields` is used as-is; anything else falls back to the island's own
      // MEMBER_SEARCH_CONFIG, so the panel never paints against a shape the template can't render.
      vm.fieldsReady = false;
      vm.config = MEMBER_SEARCH_CONFIG;
      $scope.$watch('config', function (config: any) {
        if (config == null) return;
        vm.config = Array.isArray(config.fields) ? config : MEMBER_SEARCH_CONFIG;
        vm.fieldsReady = true;
      });
      // The island's OWN model, held on the scope (the template binds `draft[field.name]`) — never the
      // legacy `search` model the host controller owns.
      $scope.draft = angular.copy($scope.criteria || {});
      vm.open = false;
      let debounce: any;

      function prune(c: any): Record<string, string> {
        const out: Record<string, string> = {};
        angular.forEach(c || {}, function (v: any, k: string) {
          if (typeof v === 'string' && v.trim() !== '') out[k] = v;
        });
        return out;
      }

      // Active-filter count for the trigger badge (counts the applied criteria).
      vm.activeCount = function () {
        return Object.keys(prune($scope.criteria)).length;
      };

      // Presentation branch on the FOOTPRINT axis: the native fit (motu ocean) shows the filters
      // inlined in place; the legacy/compact fit keeps them behind the click-to-open trigger.
      vm.isInline = function () {
        return $scope.fit === 'legacy';
      };

      // Resync the draft when the store's criteria changes (e.g. a chip removed on another island).
      $scope.$watch(
        'criteria',
        function (next: any) {
          $scope.draft = angular.copy(next || {});
        },
        true,
      );

      // Auto search: emit the pruned criteria (debounced) whenever the draft changes; equals-guard
      // prevents echoing our own store writes back out.
      $scope.$watch(
        function () {
          return prune($scope.draft);
        },
        function (pruned: any) {
          if (angular.equals(pruned, prune($scope.criteria))) return;
          if (debounce) $timeout.cancel(debounce);
          debounce = $timeout(function () {
            ($scope.onCriteriaChanged || angular.noop)(pruned);
          }, 250);
        },
        true,
      );

      vm.reset = function () {
        $scope.draft = {};
        ($scope.onReset || angular.noop)();
      };
    },
  ],
};
