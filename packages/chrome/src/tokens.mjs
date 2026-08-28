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
  /**
   * The icon's sand. A COUNT, the palette's ↵ marker, an avatar — the one warm note in a cold ramp,
   * which is what makes a number read as a number rather than as more water.
   */
  sand: 'var(--motu-sand, #e3c893)',
  /** Text on sand. Deep enough to clear AA at the sizes sand is used for. */
  onSand: 'var(--motu-on-sand, #0b3d5c)',
};

/**
 * The water ramp, deep → shallow. A READOUT, not decoration: calm teal is the mock default, `http` is
 * the same lagoon lit brighter (a live backend), `legacy` floods the bay amber. The host has no
 * transport of its own, so it paints `mock` — the calm water — and means it.
 */
export const MOTU_WATER = {
  /**
   * `abyss` and `foam` come from `assets/motu-icon.svg` — the mark's own deep blue and light water —
   * so the chrome and the icon finally agree instead of being two blues that nearly match. The rest
   * of the ramp is unchanged; these extend it at both ends rather than replacing anything.
   */
  mock: { deep: '#0b6f68', mid: '#12988f', shallow: '#35c2b3', accent: '#0f766e', abyss: '#0f5b8a', foam: '#5cc0e8' },
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
  /**
   * A lighter ground for the pages that are mostly white cards.
   *
   * `page` is right behind panels that are themselves tinted; behind a column of white rows it reads
   * as a green cast on white. Both are motu's water — this one is further up the beach.
   */
  pageLight: '#f2f9f8',
  /** A card at rest. Opaque, unlike `row`, which is a row lifted off a tinted panel. */
  card: '#ffffff',
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
  /**
   * Captions and unit labels — warm, deliberately not a cool grey.
   *
   * DARKENED from #9a9182, which measured 2.87:1 on the page ground: uppercase 10px at .09em is the
   * smallest text motu sets, and it was the least legible. Still the same warm family — the point of
   * this token is that a cool grey here reads as a different product — just readable. Nothing else
   * reads it: `.motu-cap` is the only rule, and the bay's own meta rule outranks it on the water.
   */
  caption: '#6e6659',
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
  swimIn: '320ms cubic-bezier(.2,.9,.3,1)',
  pop: '220ms cubic-bezier(.22,1.2,.36,1)',
  /**
   * A lit thing moving from one place to another, overshooting slightly as water does.
   *
   * Named because the tide line already used this exact curve for its segmented control's thumb and
   * for re-docking, spelled out as a literal in both — the third motion in the language, and the only
   * one that was not written down. A component that slides should not have to invent its own easing.
   */
  slide: '260ms cubic-bezier(.34,1.4,.5,1)',
  /**
   * `slide`, for something that also CHANGES SIZE as it moves — a rail spanning the row it points at.
   *
   * Slightly longer and slightly springier than `slide`, because two properties animating together
   * read as sluggish at the same timing that looks crisp on one.
   */
  rail: '300ms cubic-bezier(.34,1.45,.5,1)',
};

/**
 * VERDICTS. Semantic, and deliberately NOT derived from the primary.
 *
 * Everything above is BRAND: point `--motu-primary` at a host's own colour and the water, the
 * surfaces and the pills follow. These four must not. A gold-branded app deriving "ok" from its
 * primary ends up with a yellow ok sitting beside an amber warn, and the reader can no longer tell
 * "fine" from "look at this" — which is the only job these have.
 *
 * They were spelled out twice before this existed: as `--ok/--warn/--broken/--neutral` in the seam
 * lens' shadow stylesheet, and as `--changed/--new` in the review console. Same four hex values,
 * two vocabularies, and the console's `changed` IS the lens' `warn` — a shot that moved is a thing
 * to look at, which is what amber has always meant here.
 */
export const MOTU_VERDICT = {
  /** Settled, matching, wired. The console's `new`, the lens' `ok`. */
  ok: '#0f766e',
  /** Look at this. The console's `changed`, the lens' `warn`. Not an error. */
  warn: '#b45309',
  /** Contradicted: a declaration that does not hold. */
  broken: '#b91c1c',
  /** Nothing to say — no declared props, no status. */
  neutral: '#8d8578',
};

/**
 * The SEAM colours: one per kind of thing crossing an island's boundary. The lens bars its groups
 * with these and the graph draws its hubs in them, so a blue hub on the page and a blue group in
 * the panel are the same fact seen twice.
 *
 * `output` and `coupling` share their hue with `warn` and `broken` on purpose — an output that
 * surprises you and a contradiction are read with the same eye.
 */
export const MOTU_SEAM = {
  /** What comes IN: props, channels, host scope. */
  input: '#12988f',
  /** What goes OUT: events, writes, intents. */
  output: '#b45309',
  /** What the region ASKED the outside for. */
  requests: '#0369a1',
  /** Islands entangled through a shared key. */
  coupling: '#b91c1c',
  /** The region's own sheet. */
  region: '#0f766e',
};

/** Verdicts, on a DARK ground (the bay), where the ink versions disappear. */
export const MOTU_VERDICT_ON_BAY = {
  ok: '#bdf3ea',
  warn: '#ffd9a8',
  neutral: 'rgba(255, 255, 255, .72)',
};
