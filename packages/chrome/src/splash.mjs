// A splash of water where a person touched the screen.
//
// THE ONE PIECE OF BEHAVIOUR IN THIS PACKAGE, and it earns the exception. Everything else here is a
// stylesheet, because a stylesheet is what a bundler-less host can consume; a ripple cannot be one —
// it has to be born at the pointer, which no CSS rule knows the position of. Nine spans, thrown and
// removed, over in half a second.
//
// LIFTED FROM `tideline.ts`, whose dock invented it and kept it private, exactly as the segmented
// control and the key cap were private before they moved here. Same nine, same arc, same easing: a
// motu surface should splash the same way whichever one you are on.
//
// WAAPI RATHER THAN CSS, and that is what makes the reduced-motion check a JS one. A media query
// cannot reach an animation the Web Animations API started, so this asks and returns instead.

/** How many drops, and how far they carry. Small numbers, chosen on the dock and kept. */
const DROPS = 9;

/**
 * Throw a splash at a point in the viewport.
 *
 * `color` defaults to the chrome's own water so a caller that does not care gets motu; a caller on a
 * host's palette passes theirs. Returns nothing and cleans up after itself — the spans are removed
 * when their animation finishes, so a page that splashes a hundred times holds none of them.
 */
export function motuSplash(x, y, color = 'rgba(53, 194, 179, .55)') {
  if (typeof document === 'undefined') return;
  // ASKED, NOT STYLED. `prefers-reduced-motion` is a CSS query and this animation is not CSS, so the
  // only place it can be honoured is here.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  for (let i = 0; i < DROPS; i++) {
    const drop = document.createElement('span');
    const size = 3 + Math.random() * 3;
    // Upward, in a fan: -π/2 is straight up and the ±1.1 is how wide the throw spreads.
    const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.1;
    const distance = 26 + Math.random() * 46;
    drop.style.cssText =
      `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
      `margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;pointer-events:none;z-index:9999;` +
      `background:${color}`;
    document.body.appendChild(drop);
    const animation = drop.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        {
          // The +34 is gravity: every drop ends lower than the arc alone would put it, which is what
          // makes it read as water rather than as a firework.
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + 34}px) scale(.4)`,
          opacity: 0,
        },
      ],
      { duration: 540 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
    );
    animation.onfinish = () => drop.remove();
    // A drop whose animation is cancelled — a page navigating away mid-splash — still goes.
    animation.oncancel = () => drop.remove();
  }
}

/** The same splash, from a pointer event. The common case, so callers do not repeat the arithmetic. */
export function motuSplashFrom(event, color) {
  motuSplash(event.clientX, event.clientY, color);
}
