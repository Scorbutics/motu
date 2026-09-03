// THE DOCK, INJECTED — one definition, three consumers.
//
// `motu lagoon serve` serves a built artifact, the Vite DEV server serves a module graph, and the
// motu host frames a published one. All three must draw the SAME dock: a copy per consumer is two
// chromes that drift, and the dev loop and every runtime check run through this one, so a divergence
// here is a divergence between what a person sees while working and what the checks assert on.
//
// It lived in `lagoon.mjs` and was therefore reachable only from `lagoon serve` — which is why
// `motu lagoon dev` had no dock at all while the documentation said it did.
import { motuDockCss, motuDockJs } from '@motu/chrome/dock';

/** Append the dock to a page's HTML. It takes over only a lagoon it can drive; see the script below. */
export function injectDock(page) {
  return `${page}
<style>${motuDockCss()}</style>
<script>
${motuDockJs()}
(function () {
  var tries = 0;
  var take = function () {
    if (tries++ > 60) return;
    if (!window.__motuLagoonControl) return setTimeout(take, 200);
    // The artifact still ships its own while both exist. Hidden, not removed: it owns that element.
    // THE TWO DOCKS SHARE AN ID, and here they share a document as well — so the rule that hides the
    // artifact's would hide the replacement with it. In the host that never came up: the artifact is
    // in a frame and the new dock is in the shell. Mark ours, and hush only what is not ours.
    var mounted = document.createElement('div');
    document.body.appendChild(mounted);
    motuMountDock({ mount: mounted, lagoonWindow: function () { return window; } });
    var ours = mounted.querySelector('#tide');
    if (ours) ours.setAttribute('data-hosted', '');
    var hush = document.createElement('style');
    hush.textContent = '#tide:not([data-hosted]){display:none!important}' +
      // THE FLOATING TOOLBAR TOO. It used to be adopted by the in-page dock; with that gone it falls
      // back to floating over the application, and its chips are already in the rig out here.
      '#motu-toolbar{display:none!important}';
    document.head.appendChild(hush);
    // The served page is the lagoon itself, so the dock stands on this document and this document
    // keeps the strip — the same reserve the host's shell makes around a framed one.
    document.documentElement.dataset.motuDock =
      window.matchMedia('(max-width: 760px)').matches ? 'bottom' : 'right';
  };
  take();
})();
</script>`;
}
