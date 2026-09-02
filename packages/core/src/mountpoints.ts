// The MOUNTPOINTS view's chrome: one framed cell per slot, labelled with the slot's name.
//
// It stands in for the thing a region view cannot show — islands scattered across distinct callsites
// on the host's own page. Seeing each slot on its own is how you answer "does this island render at
// all, and is it the right one?" without the neighbours' layout carrying it.
//
// Why this is its own module. The markup has always been emitted by BOTH mount paths — the
// `<motu-archipelago>` custom element and @motu/react's React mount, which produce identical class
// names — but the stylesheet was inlined in the element path only. So a host mounting through React
// (Twenty, acme) got the structure with none of the chrome: a bare slot name as body text, no frame,
// no padding, islands running into each other. The view looked broken on exactly the hosts that most
// need it, and nothing failed, because the class names were all correct.
//
// Neutral on purpose. The cell borrows `currentColor` for its border, label and tint rather than
// naming a colour, so it reads as chrome on a host whose page is white, cream or dark without motu
// knowing anything about that host's palette. Per-slot GEOMETRY is not motu's to guess either — a
// composition root supplies it, keyed by [data-motu-arch][data-motu-slot].

/** The style element's id — one per document, whichever mount path got there first. */
const MOUNTPOINT_STYLE_ID = 'motu-mountpoint-style';

/**
 * The cell chrome. Exported as a string because the element path needs to CONCATENATE it into the
 * region's shadow sheet, where a <style> in document.head cannot reach.
 */
export const MOUNTPOINT_CSS = `
.motu-gallery { max-width: 1440px; margin: 22px auto; padding: 0 20px; display: flex; flex-direction: column; gap: 18px; }
.motu-frame { position: relative; border: 1px dashed color-mix(in srgb, currentColor 22%, transparent); border-radius: 10px; }
/* Cells never clip (a popover/modal island must be able to escape its frame). An interacted cell
   raises above later siblings so the escaped content paints on top instead of under the next cell. */
.motu-frame:hover, .motu-frame:focus-within { z-index: 2; }
.motu-frame__label { display: flex; gap: 8px; align-items: center; border-radius: 10px 10px 0 0; font: 500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; text-transform: uppercase; padding: 6px 10px; color: color-mix(in srgb, currentColor 55%, transparent); background: color-mix(in srgb, currentColor 5%, transparent); }
.motu-frame__stage { padding: 16px; }`;

/**
 * Install the chrome in this document, once. For any mount path that renders the cells into the LIGHT
 * DOM — which is every path except the archipelago element's shadow isolation, and that one folds
 * `MOUNTPOINT_CSS` into its own sheet instead.
 *
 * Safe to call on every render: it is a no-op once the style is in place.
 */
export function ensureMountpointStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(MOUNTPOINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MOUNTPOINT_STYLE_ID;
  style.textContent = MOUNTPOINT_CSS;
  document.head.appendChild(style);
}
