// motu's UI kit, as React.
//
// The shapes are declared once in `../kit.mjs` — a stylesheet a server can inline and a shadow root
// can adopt. These are the components that USE them, for the two surfaces of motu that are React
// applications: the seam lens (`@motu/debug-overlay`) and the review console.
//
// WHY A SUBPATH AND NOT THE PACKAGE ROOT. `@motu/chrome` is plain `.mjs` on purpose: the lagoon host
// serves pages from bare node with no bundler, and `packages/host` imports the root directly. A
// `.tsx` at the root would close that door, which is the door this package was created to keep open.
// So React lives behind `@motu/chrome/react`, which only a bundler ever resolves, and the root stays
// exactly as node-readable as it was.
//
// EVERY COMPONENT IS THIN. It maps props to the kit's classes and data attributes and spreads the
// rest onto the element. No component here owns state, fetches, or measures the DOM — a kit that
// starts making decisions is a framework, and both consumers already have one.
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  LiHTMLAttributes,
  ReactNode,
} from 'react';

/**
 * The four verdicts, and the two extra dot states.
 *
 * SEMANTIC, never brand — see MOTU_VERDICT. The console's `changed` is this `warn` and its `new` is
 * this `ok`; they were the same four hex values under two vocabularies before the kit existed.
 */
export type MotuTone = 'ok' | 'warn' | 'broken' | 'neutral';
export type MotuDotTone = MotuTone | 'pending' | 'external';

/** The seams a group can be about. The bar's colour is the hue the coupling graph draws it in. */
export type MotuSeam = 'input' | 'output' | 'requests' | 'coupling' | 'region' | 'coverage';

const SEAM_COLOR: Record<MotuSeam, string> = {
  input: '#12988f',
  output: '#b45309',
  requests: '#0369a1',
  coupling: '#b91c1c',
  region: '#0f766e',
  // Not a seam the coupling graph draws: coverage is about the region over TIME, so it takes a hue
  // none of the wires use rather than borrowing one and implying a relationship to it.
  coverage: '#7c3aed',
};

/** Join class names, dropping the falsy ones. Every component ends with the caller's own className. */
function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- Surfaces --------------------------------------------------------------------------------

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** `window` gives it a head and a scrolling body; `card` is a plain sheet. */
  shape?: 'card' | 'window';
  children?: ReactNode;
}

/** The frosted sheet everything sits on: the lens' floating window, the console's viewer card. */
export function Panel({ shape = 'card', className, children, ...rest }: PanelProps) {
  return (
    <div className={cx('motu-sheet-panel', className)} data-shape={shape} {...rest}>
      {children}
    </div>
  );
}

// `title` is the CONTENT here, not the tooltip — same as Bay. Both are the thing the surface is
// called, and a kit where one component's `title` is a string of hover text and another's is the
// heading is a kit you have to look up every time.
export interface PanelHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** The uppercase label at the left. Omit for a head that is only controls. */
  title?: ReactNode;
  /** Make it a drag handle. The pointer handlers are the caller's — the kit only draws the cursor. */
  grab?: boolean;
  /** Mid-drag, so the cursor can say so. */
  grabbing?: boolean;
  /**
   * A qualifier, immediately after the title and BEFORE the spacer — what this one is, when the title
   * says what kind of thing it is. Distinct from `children`, which is pushed hard right and is where
   * the head's controls go.
   */
  sub?: ReactNode;
  /** Pushed to the right of the spacer. */
  children?: ReactNode;
}

/**
 * A panel's title bar.
 *
 * The spacer is built in because every head in both applications has the same shape — a label, then
 * everything else hard right — and hand-rolling it is how two title bars end up 2px apart.
 */
export function PanelHead({ title, sub, grab, grabbing, className, children, ...rest }: PanelHeadProps) {
  return (
    <div
      className={cx('motu-head', className)}
      data-grab={grab ? '' : undefined}
      data-grabbing={grabbing ? '' : undefined}
      {...rest}
    >
      {title != null && <b>{title}</b>}
      {sub}
      <span className="motu-spacer" />
      {children}
    </div>
  );
}

/** The scrolling half of a window. */
export function PanelBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('motu-body', className)} {...rest}>
      {children}
    </div>
  );
}

// --- Labels ----------------------------------------------------------------------------------

export interface CapProps extends HTMLAttributes<HTMLElement> {
  /**
   * The element to render. A caption over a real list of things is a HEADING and screen readers
   * navigate by them; the same caption over a panel section usually is not. The kit cannot tell
   * which from the styling, so the caller says — and `axe` is the reason it matters.
   */
  as?: 'div' | 'h2' | 'h3' | 'h4';
}

/** Heads a section. */
export function Cap({ as: As = 'div', className, children, ...rest }: CapProps) {
  return (
    <As className={cx('motu-cap', className)} {...rest}>
      {children}
    </As>
  );
}

/** Heads a list inside a section — one size down from a Cap. */
export function Sub({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <div className={cx('motu-sub', className)} {...rest}>
      {children}
    </div>
  );
}

// --- Rows ------------------------------------------------------------------------------------

interface RowCommon {
  /** A card row sits on its own ground with a hairline; the default is flat on the panel. */
  surface?: 'flat' | 'card';
  /** Values being inspected — island names, store keys, payloads — stay monospace. */
  mono?: boolean;
  /** The current one. Rendered as `aria-current`, so assistive tech reads the selection too. */
  current?: boolean;
  /**
   * `chrome` (the default) is a row read BESIDE the thing it describes — a lens call, a console shot.
   * `page` is a row read on its own, on a surface a person landed on: two lines, card-sized padding,
   * a 21px name. One component with two scales rather than two components, for the same reason the
   * bay has `compact` and `masthead` instead of a second header.
   */
  scale?: 'chrome' | 'page';
  children?: ReactNode;
}

export type RowProps =
  | (RowCommon & { as?: 'div' } & HTMLAttributes<HTMLDivElement>)
  | (RowCommon & { as: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  | (RowCommon & { as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>);

/**
 * One record in a list.
 *
 * `as` decides the ELEMENT, and the element decides whether it is interactive: a `button` or an `a`
 * gets the hover lift and the focus ring, a `div` does not. That is deliberate — a clickable div was
 * how both applications ended up with rows a keyboard could not reach.
 */
export function Row(props: RowProps) {
  const { as = 'div', surface = 'flat', mono, current, scale, className, children, ...rest } = props as RowCommon & {
    as?: 'div' | 'button' | 'a';
    className?: string;
  } & Record<string, unknown>;
  const interactive = as !== 'div';
  const shared = {
    className: cx('motu-row', className),
    'data-scale': scale === 'page' ? 'page' : undefined,
    'data-surface': surface === 'card' ? 'card' : undefined,
    'data-mono': mono ? '' : undefined,
    'data-interactive': interactive ? '' : undefined,
    'aria-current': current ?? undefined,
    ...rest,
  };
  if (as === 'button') return <button type="button" {...(shared as ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
  if (as === 'a') return <a {...(shared as AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
  return <div {...(shared as HTMLAttributes<HTMLDivElement>)}>{children}</div>;
}

interface CellProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Let the content wrap instead of truncating.
   *
   * Truncation is right at chrome scale, where a row is one line and a second one would break the
   * grid. A page-scale row is deliberately TWO lines — a name and what it is made of — and the
   * ellipsis rule (`nowrap` + `overflow: hidden`) silently collapses that to one. So the default
   * stays truncation and the second line is asked for.
   */
  wrap?: boolean;
}

/** The cell that takes the remaining width and truncates rather than pushing its neighbours out. */
export function Grow({ wrap, className, children, ...rest }: CellProps) {
  return (
    <span className={cx('motu-grow', !wrap && 'motu-ellipsis', className)} {...rest}>
      {children}
    </span>
  );
}

/** The faint bit at the end of a row: a count, an age, a status word. */
export function Trail({ wrap, className, children, ...rest }: CellProps) {
  return (
    <span className={cx('motu-trail', !wrap && 'motu-ellipsis', className)} {...rest}>
      {children}
    </span>
  );
}

/** Rows that assemble rather than appear. Children are staggered by their index. */
export function List({ className, children, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cx('motu-list', className)} {...rest}>
      {children}
    </ul>
  );
}

export interface ListItemProps extends LiHTMLAttributes<HTMLLIElement> {
  /** Position in the list, which is what staggers its entrance. */
  index?: number;
}

/** A member of a List. Pass `index` and the swim-in staggers; leave it out and they all arrive at once. */
export function ListItem({ index, style, className, children, ...rest }: ListItemProps) {
  const withIndex = index == null ? style : ({ ...style, ['--i' as string]: String(index) } as CSSProperties);
  return (
    <li className={className} style={withIndex} {...rest}>
      {children}
    </li>
  );
}

// --- Pills, chips, dots ------------------------------------------------------------------------

export interface PillProps extends HTMLAttributes<HTMLElement> {
  tone?: MotuTone;
  /** Filled rather than tinted: a control's state, not a fact about a record. */
  fill?: boolean;
  mono?: boolean;
  /** `micro` is the uppercase badge the lens puts on a prop or a coupling flag. */
  size?: 'default' | 'micro';
}

/** A fact you can read without leaning in — which is worth more than one set in muted 11px grey. */
export function Pill({ tone, fill, mono, size = 'default', className, children, ...rest }: PillProps) {
  return (
    <span
      className={cx('motu-pill', className)}
      data-tone={tone}
      data-fill={fill ? '' : undefined}
      data-mono={mono ? '' : undefined}
      data-size={size === 'micro' ? 'micro' : undefined}
      {...rest}
    >
      {children}
    </span>
  );
}

/** A wrapped run of pills. */
export function Chips({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('motu-chips', className)} {...rest}>
      {children}
    </div>
  );
}

export interface DotProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: MotuDotTone;
}

/** A status, at the head of a row. Decorative by construction — the row's text carries the meaning. */
export function Dot({ tone = 'neutral', className, ...rest }: DotProps) {
  return <span className={cx('motu-dot', className)} data-tone={tone} aria-hidden="true" {...rest} />;
}

// --- Controls ----------------------------------------------------------------------------------

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ghost: no ground until touched · quiet: outlined on a light surface · strong: the one action. */
  weight?: 'ghost' | 'quiet' | 'strong';
  shape?: 'default' | 'pill';
  size?: 'default' | 'icon';
  /** An armed MODE. Rendered filled, because a mode that is not visible is a trap. */
  on?: boolean;
  tone?: MotuTone;
}

/**
 * Three weights, one shape.
 *
 * `on` is separate from `aria-pressed` on purpose: some of these are toggles and read correctly as
 * pressed, and some are a segmented control's current member, which does not. The caller says which
 * it is; the kit only draws the filled state either way.
 */
export function Button({ weight = 'ghost', shape = 'default', size = 'default', on, tone, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('motu-btn', className)}
      data-weight={weight === 'ghost' ? undefined : weight}
      data-shape={shape === 'pill' ? 'pill' : undefined}
      data-size={size === 'icon' ? 'icon' : undefined}
      data-on={on ? '' : undefined}
      data-tone={tone}
      {...rest}
    >
      {children}
    </button>
  );
}

// --- Saying nothing, and saying something is wrong ------------------------------------------------

export interface EmptyProps extends HTMLAttributes<HTMLDivElement> {
  /** `block` centres it in the space a picture would have filled. */
  pad?: 'inline' | 'block';
}

/** The sentence a list shows instead of nothing. A blank box reads as broken. */
export function Empty({ pad = 'inline', className, children, ...rest }: EmptyProps) {
  return (
    <div className={cx('motu-empty', className)} data-pad={pad === 'block' ? 'block' : undefined} {...rest}>
      {children}
    </div>
  );
}

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  /** Defaults to `broken` — a notice with nothing to say is not written. */
  tone?: 'broken' | 'warn' | 'ok' | 'info';
  mono?: boolean;
}

/** A finding, inline, where it applies. */
export function Notice({ tone = 'broken', mono, className, children, ...rest }: NoticeProps) {
  return (
    <div
      className={cx('motu-notice', className)}
      data-tone={tone === 'broken' ? undefined : tone}
      data-mono={mono ? '' : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

// --- Structure -------------------------------------------------------------------------------

export interface GroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Which seam this is about — it picks the bar's colour and titles the group. */
  seam: MotuSeam;
  /** Overrides the heading text; the seam's own name is the default. */
  label?: ReactNode;
}

/**
 * A section barred in its seam colour.
 *
 * The colour goes in as `--seam` rather than as the group's `color`. Setting `color` would make every
 * child inherit it — a group whose rows are all amber is a group nobody can scan — and the reset that
 * fixes that outranks the kit's own `.motu-empty`, so an empty state inside a group came out body ink
 * instead of faint italic. Only the bar and the heading read `--seam`.
 */
export function Group({ seam, label, style, className, children, ...rest }: GroupProps) {
  return (
    <div
      className={cx('motu-group', className)}
      style={{ ['--seam' as string]: SEAM_COLOR[seam], ...style } as CSSProperties}
      {...rest}
    >
      <div className="motu-group__h">{label ?? seam}</div>
      {children}
    </div>
  );
}

export interface TableProps extends HTMLAttributes<HTMLDivElement> {
  /** A `grid-template-columns` value. Fixed tracks, because the point of this shape is scanning. */
  columns: string;
}

/** One line per row, every cell truncating. The full text belongs on the row's `title`. */
export function Table({ columns, style, className, children, ...rest }: TableProps) {
  return (
    <div className={cx('motu-table', className)} style={{ gridTemplateColumns: columns, ...style }} {...rest}>
      {children}
    </div>
  );
}

/** Depth, as a readout: faint for a record sitting still, full and lit for the one in hand. */
export function Gauge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('motu-gauge', className)} aria-hidden="true" {...rest} />;
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  /** Pushed hard right — an age, a target, a count. */
  trailing?: ReactNode;
}

/** A labelled value, in the monospace the kit reserves for data. */
export function Field({ label, trailing, className, children, ...rest }: FieldProps) {
  return (
    <div className={cx('motu-field', className)} {...rest}>
      <span className="motu-field__l">{label}</span>
      <span className="motu-field__v">{children}</span>
      {trailing != null && <span className="motu-field__t">{trailing}</span>}
    </div>
  );
}

export interface MeterProps extends HTMLAttributes<HTMLDListElement> {
  /** Label, count, and the verdict the count is about. */
  items: { label: string; value: ReactNode; tone?: MotuTone }[];
}

/** A run of counts, read at a glance — so "is anything pending?" never requires reading a list. */
export function Meter({ items, className, ...rest }: MeterProps) {
  return (
    <dl className={cx('motu-meter', className)} {...rest}>
      {items.map((it) => (
        <div key={it.label} data-tone={it.tone}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { SEAM_COLOR as MOTU_SEAM_COLOR };

// --- The bay ---------------------------------------------------------------------------------

export interface BayProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** What this is. Set in the mono readout face, like the tide line's own label. */
  title: ReactNode;
  /** How much of it there is — beside the title, at lower contrast. */
  subtitle?: ReactNode;
  /**
   * What element the title is.
   *
   * `strong` matches the host's server-rendered bay, where the page's real <h1> is elsewhere. An
   * application whose bay IS the page's heading passes `h1` — dropping it was an accessibility
   * regression the styling could not show, since the kit paints the two identically.
   */
  titleAs?: 'strong' | 'h1' | 'h2';
  /** The compact bay: a screen's header, rather than a page's masthead. */
  compact?: boolean;
  /**
   * Inside the title row, BEFORE the title: a back affordance, a menu toggle. Distinct from `lead`,
   * which rides above the row — a control beside the title and a handle over it are different
   * places, and a kit with only one of them makes the caller choose the wrong one.
   */
  leading?: ReactNode;
  /** Carried ABOVE the title row, riding on the water — a sheet's drag handle, say. */
  lead?: ReactNode;
  /** One sweep of light, for when something actually changed. */
  sheen?: boolean;
  /**
   * `masthead` is the tall end of the same component: a page's opening rather than a screen's header.
   * It brings the deeper gradient, a looping sheen, the drifting waterline and room for a headline.
   *
   * Mutually exclusive with `compact` in practice, and not enforced — the CSS resolves it (masthead
   * sets its own padding last) and a runtime guard on a styling combination nobody writes is noise.
   */
  shape?: 'masthead';
  /** The page's real heading, under the title row. Only a masthead has room for one. */
  headline?: ReactNode;
  /** A sentence under the headline: what this page is, in the product's own words. */
  blurb?: ReactNode;
  /** Hard right of the title, on the water: a readout, a control. */
  children?: ReactNode;
}

/**
 * The water band at the top of a screen.
 *
 * Shared with the host's server-rendered `motuBay` down to the class names, which is the point: the
 * two pieces of motu chrome a person sees at once — a published page and the console that reviews
 * it — must not read as two products. The console drew this gradient by hand before the kit existed.
 */
export function Bay({ title, titleAs: TitleAs = 'strong', subtitle, compact, lead, leading, sheen, shape, headline, blurb, className, children, ...rest }: BayProps) {
  const masthead = shape === 'masthead';
  return (
    <header className={cx('motu-bay', compact && 'compact', className)} data-shape={masthead ? 'masthead' : undefined} {...rest}>
      {/* A masthead's sheen is ambient rather than an event, so it is always on: the `sheen` prop
          means "something changed", and asking a page to pass it forever would make the two meanings
          one flag. The CSS gives the masthead its own looping animation for the same element. */}
      {(sheen || masthead) && <span className="sheen" aria-hidden="true" />}
      {lead != null && <div className="bay-lead">{lead}</div>}
      <div className="bay-inner">
        <div className="bay-title">
          {leading}
          <TitleAs className="bay-name">{title}</TitleAs>
          {subtitle != null && <span>{subtitle}</span>}
        </div>
        {children != null && <div className="bay-meta">{children}</div>}
      </div>
      {masthead && (headline != null || blurb != null) && (
        <div className="motu-bay__headline">
          {headline != null && <h1>{headline}</h1>}
          {blurb != null && <p>{blurb}</p>}
        </div>
      )}
      {/* LAST, and empty. The waterline is the masthead's bottom EDGE — it must paint over the
          gradient and under nothing, and it carries no content, so a trailing aria-hidden span is
          the honest markup rather than a wrapper around the page. */}
      {masthead && !compact && <span className="motu-bay__waves" aria-hidden="true" />}
    </header>
  );
}

// --- Page scale ------------------------------------------------------------------------------
//
// The shapes a surface a person LANDS on needs, which the chrome-scale kit above never had to grow:
// a wide column, a filter bar, a rail, a name, a kind. Every one of them is declared in `../kit.mjs`
// like the rest — these are the React callers, not a second definition.

export interface PageProps extends HTMLAttributes<HTMLDivElement> {
  /** The element. `main` for the column that holds the page's actual content. */
  as?: 'div' | 'main' | 'section';
  /** Sits in the gap under a masthead's waterline, close enough to read as part of the band. */
  lift?: boolean;
  /** Its children are sections stacked down the page, rather than one block. */
  stack?: boolean;
  children?: ReactNode;
}

/** The page's column: bounded width, the masthead's own gutters. */
export function Page({ as: As = 'div', lift, stack, className, children, ...rest }: PageProps) {
  return (
    <As className={cx('motu-page', className)} data-lift={lift ? '' : undefined} data-stack={stack ? '' : undefined} {...rest}>
      {children}
    </As>
  );
}

export interface SearchProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** The input itself. Passed in rather than owned, because the state belongs to the caller. */
  children?: ReactNode;
  /** The quiet mono line on the right: what the keyboard does here. */
  hint?: ReactNode;
}

/**
 * The filter bar: a card that overlaps the masthead's waterline.
 *
 * It renders no input of its own. A kit component that owned the value would be the kit making a
 * state decision, and in a motu region that decision belongs to an island's declared key.
 */
export function Search({ hint, className, children, ...rest }: SearchProps) {
  return (
    <div className={cx('motu-search', className)} {...rest}>
      {children}
      {hint != null && <span className="motu-hint">{hint}</span>}
    </div>
  );
}

/** A list with room for a rail down its left edge. */
export function Railed({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('motu-railed', className)} {...rest}>
      {children}
    </div>
  );
}

export interface RailProps extends HTMLAttributes<HTMLSpanElement> {
  /** Where the current row starts, in CSS length. Omit both to park the rail invisibly. */
  top?: string | number;
  /** How tall the current row is. */
  height?: string | number;
}

/**
 * The lit bar that TRAVELS to whichever row is current.
 *
 * The caller measures — this component does not touch the DOM, and a kit that started measuring
 * would be a kit that owns a ref, a resize observer and a layout effect for every consumer.
 */
export function Rail({ top, height, style, className, ...rest }: RailProps) {
  const idle = top == null || height == null;
  return (
    <span
      className={cx('motu-rail', className)}
      data-idle={idle ? '' : undefined}
      aria-hidden="true"
      style={{ ['--rail-top' as string]: px(top), ['--rail-height' as string]: px(height), ...style }}
      {...rest}
    />
  );
}

/** A number is a length; anything else is already one. */
function px(v: string | number | undefined): string | undefined {
  return v == null ? undefined : typeof v === 'number' ? `${v}px` : v;
}

/** The row of things a page-scale row leads with: a lamp, the name, its kind, its state. */
export function TitleLine({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('motu-title-line', className)} {...rest}>
      {children}
    </span>
  );
}

/** What the row IS, at page scale. */
export function Name({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('motu-name', className)} {...rest}>
      {children}
    </span>
  );
}

export interface KindProps extends HTMLAttributes<HTMLSpanElement> {
  /** `sand` for the one kind that is a limit rather than a category. */
  tone?: 'sand';
}

/**
 * What KIND of thing a row is — a lagoon, a group, a baseline.
 *
 * Distinct from `Pill`, which carries a STATE. A kind never changes and a state is the whole reason
 * you are looking; painting them alike is how a page stops being scannable.
 */
export function Kind({ tone, className, children, ...rest }: KindProps) {
  return (
    <span className={cx('motu-kind', className)} data-tone={tone} {...rest}>
      {children}
    </span>
  );
}

/** The sand return mark. Appears on the row a keyboard or a cursor is on, and nowhere else. */
export function Enter({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('motu-enter', className)} aria-hidden="true" {...rest}>
      ↵
    </span>
  );
}

/** A person, as a sand disc. Give it their initial; give the element their name. */
export function Avatar({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('motu-avatar', className)} {...rest}>
      {children}
    </span>
  );
}

export interface SegmentedProps extends HTMLAttributes<HTMLDivElement> {
  /** Where the lit thumb sits, in CSS length — the caller measures. */
  thumbLeft?: string | number;
  thumbWidth?: string | number;
  children?: ReactNode;
}

/**
 * The dock's segmented control: the lit pill SLIDES between options rather than blinking on.
 *
 * The thumb is positioned by the caller for the same reason the rail is — only the caller knows where
 * the active option sits, and measuring is not the kit's job.
 */
export function Segmented({ thumbLeft, thumbWidth, className, children, ...rest }: SegmentedProps) {
  return (
    <div className={cx('motu-segmented', className)} role="group" {...rest}>
      <span
        className="motu-segmented__thumb"
        aria-hidden="true"
        style={{ left: px(thumbLeft), width: px(thumbWidth) }}
      />
      {children}
    </div>
  );
}

export interface OptProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The chosen one. Rendered as `aria-current`, like every other selection in the kit. */
  current?: boolean;
}

/** One option on a rail or in a segmented control. */
export function Opt({ current, className, children, ...rest }: OptProps) {
  return (
    <button type="button" className={cx('motu-opt', className)} aria-current={current ?? undefined} {...rest}>
      {children}
    </button>
  );
}

/** A key cap. `<kbd>` because that is what it is — the styling is the second reason, not the first. */
export function Kbd({ className, children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd className={cx('motu-kbd', className)} {...rest}>
      {children}
    </kbd>
  );
}

/**
 * motu's mark.
 *
 * A span with a background, not an `<img>`: the SVG is inlined in the stylesheet, so there is no
 * asset to 404 and no second copy for the pages the host renders without a bundler. `role="img"` and
 * a label because a background image is invisible to assistive tech by construction.
 */
export function Mark({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('motu-mark', className)} role="img" aria-label="motu" {...rest} />;
}
