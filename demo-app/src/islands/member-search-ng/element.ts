import type { ElementSpec } from '@motu/react';
import { defineAngularElement } from '@motu/adapter-angularjs';
import { memberSearchNgAngular } from '../../ui/member-search-ng/MemberSearchNg.ng.js';

// Seam-isolated island: isolate scope + motu props/events (no adopt, no inheritScope). `criteria`
// comes from the store; `criteria-changed`/`reset` go back to it. `config` is the field schema,
// also fed in from the store (a host channel mirrors the app's hostSearchConfig) so the island
// stays host-agnostic — no walking the host scope tree. It's motu-designed (its own gm-* look),
// rendered in LIGHT isolation — the framework's .motu-root marker + scoped reset carry the gm-*
// styling in light DOM (see defineIsland), and light keeps it in the host's forms/cascade.
export const memberSearchNgElement: ElementSpec = {
  tag: 'x-member-search-ng',
  define: ({ css, defaultTheme }) =>
    defineAngularElement('x-member-search-ng', memberSearchNgAngular, {
      // The whole boundary in one place — input (props), output (events), effects (what it reaches).
      contract: {
        input: ['criteria', 'config'],
        output: { onCriteriaChanged: 'criteria-changed', onReset: 'reset' },
        // Host-scope names it resolves rather than receives: the island mounts as a non-isolate child
        // of the scope that owns the search, so host state beside it stays resolvable. Reaching a name
        // it was not handed is an effect, and it sits in the same list as a module or a table. Must be
        // provided by the lagoon host stub; the real embedded host stays the integration suite's job.
        effects: [{ scope: 'hostSearchConfig' }, { scope: 'search' }],
      },
      // HOW it attaches — mechanism, not boundary.
      mount: { hostScopeKey: 'hostSearchConfig' },
      legacy: 'fill',
      css,
      defaultTheme,
      isolation: 'light',
    }),
};
