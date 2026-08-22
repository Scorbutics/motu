// motu's design language, in one place, as data.
//
// WHY THIS PACKAGE EXISTS. The palette used to live in `@motu/core/toolbar.ts`, whose own comment
// claims it is "one place, so the tooling cannot drift into a second brand colour" — true for
// everything Vite compiles, and false for everything else. The lagoon host renders pages from bare
// node with no bundler, so it could not import a single token and grew its own dark-slate palette:
// a second brand, exactly what that comment forbids.
//
// So the tokens moved DOWN, into a package with no dependencies and no TypeScript, importable by
// Vite (which compiles `@motu/core`) and by plain `node` (which serves the host) alike. Anything that
// paints motu's own chrome — as opposed to an application's UI — reads from here.
//
// PLAIN .mjs ON PURPOSE. `@motu/*` ship as raw TypeScript and are transpiled by whatever bundler the
// consumer already runs; the host runs none. ESM that node executes as-is is the only form both can
// consume, and it is the same choice the CLI and codegen already made.

/**
 * The chrome palette. The primary IS the lagoon's own water: motu's UI and the lagoon it frames are
 * the same surface, and a chip in a different hue reads as belonging to something else.
 *
 * Every value is a `var()` with motu's default baked in as the fallback, so `applyMotuChrome` can
 * point the whole system at a host application's primary by setting the custom properties — and
 * anything rendered before that (a server-rendered host page, which has no host to borrow from)
 * still gets motu's own teal.
 */
export const MOTU_CHROME = {
  /** Every "on" and calm-default state. */
  primary: 'var(--motu-primary, #0f766e)',
  /** The primary, deeper — text on a tinted primary ground. */
  primaryDeep: 'var(--motu-primary-deep, #0b5b55)',
  /** Text ON a primary ground. A bright host primary needs dark text, not white. */
  onPrimary: 'var(--motu-on-primary, #fff)',
  /** Proceed with care: real backend, or the legacy footprint. Not an error. */
  caution: 'var(--motu-caution, #b45309)',
  /** Off. */
  idle: 'var(--motu-idle, #1e293b)',
};

/**
 * The water ramp, deep → shallow. A READOUT, not decoration: calm teal is the mock default, `http` is
 * the same lagoon lit brighter (a live backend), `legacy` floods the bay amber. The host has no
 * transport of its own, so it paints `mock` — the calm water — and means it.
 */
export const MOTU_WATER = {
  mock: { deep: '#0b6f68', mid: '#12988f', shallow: '#35c2b3', accent: '#0f766e' },
  http: { deep: '#076b7f', mid: '#0fa4b4', shallow: '#3fd0d8', accent: '#0e8a92' },
  legacy: { deep: '#a4530a', mid: '#d97706', shallow: '#fbbf24', accent: '#b45309' },
};

/**
 * Surfaces. motu's panels are LIGHT and faintly teal — the tide line's own
 * `linear-gradient(180deg, rgba(247,253,252,.94), rgba(232,248,246,.92))` — not dark slate. Getting
 * this wrong is what made the host's first pages read as a different product.
 */
export const MOTU_SURFACE = {
  /** The page behind everything: the palest shallow water. */
  page: '#eef8f6',
  /** A panel floating on it. */
  panel: 'linear-gradient(180deg, rgba(247, 253, 252, .94), rgba(232, 248, 246, .92))',
  /** A panel's flat equivalent, where a gradient would band across a tall element. */
  panelFlat: 'rgba(250, 254, 253, .96)',
  /** A row inside a panel, lifted just off it. */
  row: 'rgba(255, 255, 255, .72)',
  /** Hairline between rows — teal-tinted, never neutral grey. */
  line: 'rgba(11, 111, 104, .12)',
};

/** Ink. The warm greys are the tide line's; a neutral grey here reads as a different family. */
export const MOTU_INK = {
  body: '#22302c',
  muted: '#6b7d78',
  /** Captions and unit labels — warm, deliberately not a cool grey. */
  caption: '#9a9182',
  faint: '#a39a8a',
};

export const MOTU_SHADOW = {
  /** A floating panel. Tinted with the deep water rather than black. */
  panel: '0 14px 40px rgba(11, 111, 104, .18)',
  /** The bay capsule. */
  bay: '0 6px 18px rgba(0, 0, 0, .22)',
  /** A chip. */
  chip: '0 4px 14px rgba(15, 23, 42, .28)',
};

export const MOTU_TYPE = {
  family: '"Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
};

export const MOTU_RADIUS = {
  /** A pill / the bay capsule. */
  pill: '999px',
  /** A panel. */
  panel: '14px',
  /** A row or a field. */
  row: '8px',
};

/** The motion the tide line uses when something assembles rather than appears. */
export const MOTU_MOTION = {
  swimIn: '260ms cubic-bezier(.2,.9,.3,1)',
  pop: '220ms cubic-bezier(.22,1.2,.36,1)',
};
