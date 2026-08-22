// The motu chrome's one reveal: a surface ARRIVES AS WATER, coming in from whatever the human just
// touched — the bay's panel pours out of the bay, the seam lens pours out of its tab.
//
// It lives here because two packages draw it (@motu/react's tideline and the dev-only
// @motu/debug-overlay) and neither may depend on the other. A second copy of a wave is exactly the
// kind of thing that drifts: one of them gets a longer period, and the chrome stops reading as one
// tool.
//
// How it works: a mask twice the surface's size along the flood axis, opaque on one side of a wavy
// boundary and transparent on the other. Sliding it walks that boundary across the surface, so what
// you see is a crest travelling over the content rather than a box fading in. A mask rather than a
// clip-path because `path()` only interpolates between shapes with an identical segment count, which
// would tie the wave's period to the surface's size.

/** The side the water comes IN from. Always the side of the thing that was clicked. */
export type FloodFrom = 'top' | 'bottom' | 'left' | 'right';

export interface Flood {
  /** For `mask-image` / `-webkit-mask-image`. */
  image: string;
  /** For `mask-size` — twice the surface along the flood axis. */
  size: string;
  /** `mask-position` at [empty, full]. Animate between them; reverse to drain. */
  positions: [string, string];
}

/** How many half-periods of swell run along the crest. */
const HALVES = 10;
/** Crest height, in mask units — i.e. as a fraction of the surface along the flood axis. */
const AMPLITUDE = 7;

/**
 * The wavy boundary, drawn across the 100-unit CROSS axis at the 100 mark of the 200-unit flood axis,
 * then closed over whichever side is water.
 *
 * `vertical` swaps which coordinate is which: the same crest, turned a quarter turn, so a surface fed
 * from below fills the way a tide comes in rather than the way a curtain draws.
 */
function wave(vertical: boolean, waterOnLow: boolean): string {
  const half = 100 / HALVES;
  const pt = (along: number, across: number) =>
    vertical ? `${across} ${along}` : `${along} ${across}`;
  const rel = (along: number, across: number) =>
    vertical ? `${across} ${along}` : `${along} ${across}`;
  // One quadratic half-period, then `t` to mirror it down the rest of the crest.
  let d = `M${pt(100, 0)} q${rel(-AMPLITUDE, half / 2)} ${rel(0, half)}`;
  for (let i = 1; i < HALVES; i++) d += ` t${rel(0, half)}`;
  // Close over the WATER side. The other side of the boundary is what has not arrived yet.
  const edge = waterOnLow ? 0 : 200;
  d += ` L${pt(edge, 100)} L${pt(edge, 0)} Z`;
  return d;
}

/**
 * A flood coming in from `from`. Apply `image`/`size` to the surface, then animate `mask-position`
 * from `positions[0]` to `positions[1]` — and back again to drain it.
 */
export function flood(from: FloodFrom): Flood {
  const vertical = from === 'top' || from === 'bottom';
  // Water grows from the side it enters, so the opaque half of the mask is the half on that side.
  const waterOnLow = from === 'top' || from === 'left';
  const d = wave(vertical, waterOnLow);
  const viewBox = vertical ? '0 0 100 200' : '0 0 200 100';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'>` +
    // A touch of blur: a hard mask edge reads as a cut, not as a waterline.
    `<filter id='f'><feGaussianBlur stdDeviation='1.1'/></filter>` +
    `<path d='${d}' fill='#fff' filter='url(#f)'/></svg>`;
  // At 0% the window sits over the mask's low half, at 100% over its high half. Whichever half is
  // WATER is therefore the full state, and the other is the empty one.
  const low = '0% 0%';
  const high = vertical ? '0% 100%' : '100% 0%';
  return {
    image: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    size: vertical ? '100% 200%' : '200% 100%',
    positions: waterOnLow ? [high, low] : [low, high],
  };
}

/** Put the mask on. Both spellings, because -webkit-mask-* is still the only one some engines take. */
export function applyFlood(el: HTMLElement, f: Flood): void {
  el.style.maskImage = f.image;
  el.style.webkitMaskImage = f.image;
  el.style.maskSize = f.size;
  el.style.webkitMaskSize = f.size;
  el.style.maskRepeat = 'no-repeat';
  el.style.webkitMaskRepeat = 'no-repeat';
}

/**
 * Take it off again. A live mask on a surface that has fully arrived is compositing work for a shape
 * nobody can see — and on a scrolling, live-updating panel that is not free.
 */
export function clearFlood(el: HTMLElement): void {
  el.style.removeProperty('mask-image');
  el.style.removeProperty('-webkit-mask-image');
  el.style.removeProperty('mask-size');
  el.style.removeProperty('-webkit-mask-size');
  el.style.removeProperty('mask-repeat');
  el.style.removeProperty('-webkit-mask-repeat');
}

/** Keyframes for `element.animate()`: `dir` 'in' pours it, 'out' drains it. */
export function floodFrames(f: Flood, dir: 'in' | 'out'): Keyframe[] {
  const [empty, full] = f.positions;
  const frames: Keyframe[] = [
    { maskPosition: empty, WebkitMaskPosition: empty },
    { maskPosition: full, WebkitMaskPosition: full },
  ];
  // Indexed by construction — the array is built two lines up — but `noUncheckedIndexedAccess` cannot
  // see that, and it is the flag `strict-boundaries` asks every adopting project to turn on. The
  // framework failing its own recommendation was found by a greenfield project that took the advice.
  return dir === 'in' ? frames : [frames[1]!, frames[0]!];
}
