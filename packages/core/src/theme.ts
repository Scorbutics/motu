// Two ORTHOGONAL compatibility axes an island can be mounted in:
//
//   theme (skin)  — colour/font/radius/shadow. `legacy` blends into the host palette; `motu` is the
//                   vibrant preview look. Pure CSS: flipping it never changes the DOM.
//   fit (shape)   — the island's FOOTPRINT in the host layout. `legacy` makes it adopt the host's
//                   form-factor (full-width, flat, legacy density, expanded controls); `native` is
//                   the modern shape (compact triggers, cards, popovers). Mostly CSS, but the few
//                   islands that structurally reshape read the injected `fit` prop and branch.
//
// Keeping them independent lets an island be e.g. legacy-skinned but native-shaped, and — crucially —
// forces the legacy FOOTPRINT to exist even when the popover/compact DOM couldn't be reproduced by
// CSS alone (see LegacyStrategy).
export type MotuTheme = 'legacy' | 'motu';
export type MotuFit = 'legacy' | 'native';

// Declared once per island at registration (a REQUIRED field in defineReactElement), this is how the
// framework FORCES every new island to have a legacy fit. It selects HOW the island satisfies the
// legacy footprint:
//   'fill'       — CSS-only: a block island becomes full-width + flat + legacy-spaced (header, table).
//   'inline'     — CSS-only: an inline cluster stretches/stacks to fill a narrow rail (chips, actions).
//   'structural' — the component itself reshapes: it receives `fit` and renders a legacy layout
//                  branch (e.g. an always-expanded search rail instead of a Filters popover).
// The first two cover the majority with zero component code; 'structural' is the escape hatch.
export type LegacyStrategy = 'fill' | 'inline' | 'structural';
