// The shell's arrangement as the lagoon renders it: the bar across the top, full width.
//
// In the app the shell's other half is the routed PAGE, which is host content and not a slot — so
// this is the region's own part of the arrangement and nothing more.
export const SHELL_LAYOUT = `
<style>
  .gm-shell > motu-island { display: block; }
</style>
<div class="gm-arch gm-shell">
  <motu-island slot="app-nav" theme="motu" fit="native"></motu-island>
</div>`;
