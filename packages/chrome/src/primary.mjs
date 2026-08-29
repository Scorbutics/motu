// FINDING A LAGOON'S PRIMARY COLOUR FROM ITS PIXELS.
//
// A published lagoon declares its colour today with chrome.brand in lagoon.config.json, which is a
// manual step somebody has to remember. This module removes it: rasterise the artifact, quantize the
// pixels, and the app's own primary falls out.
//
// WHY PIXELS AND NOT THE STYLESHEET. Two cheaper routes were measured against real artifacts and both
// failed. Reading custom properties: twenty's artifact DEFINES 2081 of them and every conventional
// name resolves to empty string on :root, because they are declared on component scopes and theme
// classes -- so it is name-guessing across 2081 candidates. Sampling computed styles: nearly every
// element's background-color computes to rgba(0,0,0,0), and colours come back as
// color(display-p3 0.2 0.2 0.2), so a sampler needs a special case per CSS feature and still cannot
// see what actually painted. Pixels have gradients, images, inheritance and wide-gamut already
// resolved to sRGB by the browser, which is the only representation that matches what a person sees.
//
// A GREY ANSWER IS AN ANSWER. Twenty's lagoon rasterises to zero chromatic pixels, and that is
// correct rather than a failure -- Twenty's product UI is greyscale, so its primary is a neutral and
// the chrome should wear a neutral. Falling back to motu teal there would paint every greyscale app
// in somebody else's colour. So the neutral case picks the dominant mid-to-dark grey instead of
// giving up, and reports neutral: true so a caller that wants to decide otherwise still can.
//
// The pure functions here take a pixel buffer and are tested in node with no browser. Only
// rasteriseDocument needs a DOM.

/** Sane hex for one 0-255 triple. */
export function hexOf(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** #abc and #aabbcc both, to a 0-255 triple. Null when it is not a hex colour. */
export function parseHex(hex) {
  const m = String(hex).trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 0-255 triple to { h: 0-360, s: 0-1, l: 0-1 }. */
export function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
  const d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
    else if (mx === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

/** { h, s, l } back to a 0-255 triple. */
export function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = ((h % 360) + 360) % 360 / 360;
  const channel = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(hk + 1 / 3), channel(hk), channel(hk - 1 / 3)].map((v) => Math.round(v * 255));
}

/** WCAG relative luminance for a 0-255 triple. */
export function relativeLuminance(r, g, b) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two 0-255 triples, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a[0], a[1], a[2]);
  const lb = relativeLuminance(b[0], b[1], b[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The dominant colour of an RGBA buffer, as the app meant it.
 *
 * Chromatic pixels are bucketed by HUE, so one colour spread over a gradient or an antialiased edge
 * counts once instead of splitting into a dozen near-identical bins. When too few pixels are
 * chromatic to mean anything the page is genuinely greyscale, and the answer is the dominant
 * mid-to-dark grey -- excluding near-white (which is the page ground, not the brand) and near-black
 * (which is text on every app whatever its colour). The ceiling is 0.6 because measured against
 * twenty's real artifact a looser one answered #b7b7b7, a divider tone, over the ink that actually
 * carries the screen.
 *
 * Returns null only when the buffer had nothing opaque in it at all.
 */
export function dominantPrimary(data, opts = {}) {
  const {
    alphaMin = 200,
    satMin = 0.18,
    lightMin = 0.12,
    lightMax = 0.95,
    chromaMin = 0.005,
    // SAMPLE, not clamp -- and named apart from normalisePrimary's neutralLightMin/Max on purpose.
    // Both functions receive the same opts object from detectPrimary, and when these two shared a
    // name, asking for a wider SAMPLING band silently widened the OUTPUT clamp as well: every
    // detected colour came back unnormalised. It looked like a tuning result, which is the dangerous
    // kind of bug. Two meanings, two names.
    neutralSampleMin = 0.08,
    neutralSampleMax = 0.6,
    hueBuckets = 24,
  } = opts;

  const chroma = new Map();
  const neutral = new Map();
  let opaque = 0, chromaticCount = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (data[i + 3] < alphaMin) continue;
    opaque++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    const light = mx / 255;
    if (sat >= satMin && light > lightMin && light < lightMax) {
      chromaticCount++;
      const { h } = rgbToHsl(r, g, b);
      const key = Math.floor(h / (360 / hueBuckets)) % hueBuckets;
      const acc = chroma.get(key) || [0, 0, 0, 0];
      acc[0] += r; acc[1] += g; acc[2] += b; acc[3]++;
      chroma.set(key, acc);
    } else if (sat < satMin && light >= neutralSampleMin && light <= neutralSampleMax) {
      const key = Math.floor(light * 16);
      const acc = neutral.get(key) || [0, 0, 0, 0];
      acc[0] += r; acc[1] += g; acc[2] += b; acc[3]++;
      neutral.set(key, acc);
    }
  }

  if (opaque === 0) return null;
  const chromaticFraction = chromaticCount / opaque;
  const best = (m) => {
    let top = null;
    for (const acc of m.values()) if (!top || acc[3] > top[3]) top = acc;
    return top;
  };

  if (chromaticFraction >= chromaMin) {
    const top = best(chroma);
    if (top) {
      return { hex: hexOf(top[0] / top[3], top[1] / top[3], top[2] / top[3]), neutral: false, chromaticFraction, opaque };
    }
  }
  const top = best(neutral);
  if (!top) return null;
  return { hex: hexOf(top[0] / top[3], top[1] / top[3], top[2] / top[3]), neutral: true, chromaticFraction, opaque };
}

/**
 * A raw app colour, made usable as motu's primary.
 *
 * NOT OPTIONAL, and peps proves why: its hand-written brand is
 * color-mix(in srgb, hsl(var(--primary-control)) 75%, #000) -- a 25% darkening somebody applied by
 * eye because the app's own colour was too light to carry white text or to sit under the water ramp.
 * Detection has to do that correction itself or it ships confident, unreadable chrome.
 *
 * The HUE is what belongs to the app and is always kept. Saturation and lightness are clamped into
 * the band motu's ramp was designed around -- motu's own #12988f sits at s .78 / l .33, inside it, so
 * a lagoon that IS motu teal comes back unchanged. A neutral keeps s 0 and is only pulled dark enough
 * to be a foreground.
 */
export function normalisePrimary(hex, opts = {}) {
  const {
    neutral = false,
    satMin = 0.35, satMax = 0.85,
    lightMin = 0.28, lightMax = 0.52,
    neutralLightMin = 0.20, neutralLightMax = 0.40,
    onLight = '#ffffff', onDark = '#101413',
    // 3:1, WHICH IS THE RIGHT BAR FOR WHAT THIS TOKEN IS USED ON, and not a lowered one. --motu-on-primary
    // sits on the bay masthead, the water ramp and the primary button -- headings and 600-weight
    // labels, which is WCAG's large-text and UI-component threshold rather than the 4.5:1 body-text
    // one. Set it to 4.5 and motu's OWN teal fails: white on #12988f is 3.97:1, so the detector would
    // put dark text on motu-coloured chrome and disagree with every masthead the framework ships.
    // Measured on the real artifact -- motu-demo-app detected #1c9081 and came back with dark text.
    contrastTarget = 3,
  } = opts;
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const out = neutral
    ? hslToRgb(h, 0, clamp(l, neutralLightMin, neutralLightMax))
    : hslToRgb(h, clamp(s, satMin, satMax), clamp(l, lightMin, lightMax));
  const primary = hexOf(out[0], out[1], out[2]);
  const light = parseHex(onLight), dark = parseHex(onDark);
  const onPrimary = contrastRatio(out, light) >= contrastTarget
    ? onLight
    : (contrastRatio(out, dark) >= contrastRatio(out, light) ? onDark : onLight);
  return { primary, onPrimary, neutral };
}

/**
 * The CSS custom properties a detected primary should set.
 *
 * The SAME RAMP applyMotuChrome builds, expressed as data so a page that has no access to
 * `@motu/core` -- the node host's composed page is a plain HTML string -- can apply it too. Keep the
 * two in step: the percentages here are copied from applyMotuChrome deliberately, because a second
 * ramp with slightly different numbers is exactly the drift this package exists to prevent.
 */
export function primaryVars(primary, onPrimary) {
  const mix = (pct, other) => 'color-mix(in srgb, ' + primary + ' ' + pct + '%, ' + other + ')';
  const vars = {
    '--motu-primary': primary,
    '--motu-primary-deep': mix(78, '#000'),
    '--motu-water-deep': mix(84, '#000'),
    '--motu-water-mid': primary,
    '--motu-water-shallow': mix(68, '#fff'),
    '--motu-surface-page': mix(8, '#fff'),
    '--motu-line': mix(14, 'transparent'),
    '--motu-surface-panel': 'linear-gradient(180deg, ' + mix(3, '#fff') + ', ' + mix(9, '#fff') + ')',
  };
  if (onPrimary) vars['--motu-on-primary'] = onPrimary;
  return vars;
}

/** Every property primaryVars can set, so a caller can CLEAR a palette it previously applied. */
export const PRIMARY_VAR_NAMES = Object.keys(primaryVars('#000'));

/**
 * Rasterise a document to an RGBA buffer, via SVG foreignObject.
 *
 * Measured against the published artifacts: no CSP blocks the data URI, the canvas is not tainted,
 * and motu's own chrome does not survive into the raster -- twenty's tide-line pill is plainly teal
 * on screen and contributed zero chromatic pixels -- so what comes back is the app's own content.
 *
 * Returns null rather than throwing: a cross-origin image taints the canvas, and a caller that
 * cannot detect a colour should keep the one it has.
 */
export async function rasteriseDocument(doc, opts = {}) {
  // EXCLUDE THE DOCK BY DEFAULT. motu's own tide line is the one thing on a lagoon page guaranteed to
  // be motu-coloured, and detecting it would make every project come back teal -- the tool finding
  // itself. Empirically it does not survive into the raster anyway (twenty's pill is plainly teal on
  // screen and contributed zero chromatic pixels), but "it happens not to show up" is not a reason,
  // and the day it starts showing up nothing would announce it.
  const { width = 480, height = 320, timeoutMs = 8000, exclude = '#tide' } = opts;
  try {
    const win = doc.defaultView;
    const cw = doc.documentElement.clientWidth || width;
    const ch = doc.documentElement.clientHeight || height;
    const clone = doc.documentElement.cloneNode(true);
    // Scripts never run inside foreignObject and only bloat the payload.
    clone.querySelectorAll('script').forEach((s) => s.remove());
    if (exclude) clone.querySelectorAll(exclude).forEach((n) => n.remove());
    const xml = new win.XMLSerializer().serializeToString(clone);
    const scale = width / cw;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
      '<foreignObject width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + cw + 'px;height:' + ch +
      'px;transform:scale(' + scale + ');transform-origin:0 0">' + xml + '</div>' +
      '</foreignObject></svg>';
    const img = new win.Image();
    const ok = await new Promise((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      win.setTimeout(() => res(false), timeoutMs);
    });
    if (!ok) return null;
    const canvas = doc.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  }
}

/**
 * The whole thing: a document in, a usable primary out, or null when it could not be read.
 */
export async function detectPrimary(doc, opts = {}) {
  const raster = await rasteriseDocument(doc, opts);
  if (!raster) return null;
  const found = dominantPrimary(raster.data, opts);
  if (!found) return null;
  const normalised = normalisePrimary(found.hex, { ...opts, neutral: found.neutral });
  if (!normalised) return null;
  return { ...normalised, raw: found.hex, chromaticFraction: found.chromaticFraction };
}

/**
 * detectPrimary, retried until the page has actually painted something.
 *
 * LOAD IS NOT PAINTED. A lagoon renders itself client-side, so the first honest raster is blank white
 * -- no chromatic pixels and no neutral in band -- and detection correctly answers "nothing here".
 * Asking once, at load, gets that answer forever. This asks again on a widening delay and stops at
 * the first real one.
 *
 * `shouldContinue` lets a caller abandon a page the viewer has already navigated away from, so a
 * slow raster cannot paint the chrome for a lagoon nobody is looking at any more.
 */
export async function detectPrimarySettled(doc, opts = {}) {
  // EIGHT, because a big artifact is slow. Exponential from 300ms, so the budget is about 38s in
  // total while only ~3 rasters actually land during a 25s load. Six attempts (9.3s) was enough for
  // every lagoon tested locally and silently too short for twenty's published one -- 19.66 MB, ~25s
  // to first paint -- which detected in dev and never detected in production.
  const { attempts = 8, baseDelayMs = 300, shouldContinue = null } = opts;
  const win = (doc && doc.defaultView) || globalThis;
  for (let n = 0; n < attempts; n++) {
    if (shouldContinue && !shouldContinue()) return null;
    const found = await detectPrimary(doc, opts);
    if (found) return found;
    if (n < attempts - 1) {
      await new Promise((res) => win.setTimeout(res, baseDelayMs * Math.pow(2, n)));
    }
  }
  return null;
}

/**
 * The detector as source, for a page that cannot import a module.
 *
 * The node host's composed shell is a plain HTML string with one inline script -- there is no bundler
 * in that path and no module graph to hang this off. Built by serialising the SAME functions rather
 * than by keeping a hand-written copy beside them, because a second copy of a colour algorithm is
 * exactly the drift this package exists to prevent: it would pass its own tests forever while
 * answering differently from the one under test.
 *
 * Every function here is a declaration that closes over nothing but the others, which is what makes
 * the serialisation valid on its own. Keep it that way -- a module-level constant referenced from one
 * of these bodies would serialise to a ReferenceError in the page, and nothing in node would notice.
 */
const PRIMARY_DETECT_PARTS = {
  hexOf, parseHex, rgbToHsl, hslToRgb, relativeLuminance, contrastRatio,
  dominantPrimary, normalisePrimary, primaryVars, rasteriseDocument, detectPrimary,
  detectPrimarySettled,
};

/**
 * Serialise a set of named functions into source a plain <script> can run.
 *
 * Exported so the RENAMING rule below can be tested with functions that are actually renamed --
 * everything in this file is unminified when the tests run, so a test over PRIMARY_DETECT_JS alone
 * cannot reach the case that broke production.
 */
export function primaryDetectSource(parts) {
  return [
    // The functions as authored -- or as a MINIFIER left them, which is the whole reason for the
    // aliases below.
    ...Object.values(parts).map((f) => f.toString()),
    // STABLE NAMES, because a bundler renames these and the caller is a string.
    //
    // The host app is bundled and minified for production, so detectPrimary.toString() comes back as
    // "function fe(...)". The functions still call EACH OTHER correctly (the minifier renamed both
    // sides), but the page's own script is a template literal that minification never touches, so it
    // went on calling detectPrimary -- a name that no longer existed. Live, and only live: dev builds
    // are not minified, so every check passed right up until it was deployed.
    //
    // f.name is whatever the function ended up called, so this maps the name the caller uses onto the
    // name the function actually has, and emits nothing when nothing was renamed.
    ...Object.entries(parts)
      .filter(([name, f]) => f.name && f.name !== name)
      .map(([name, f]) => `var ${name} = ${f.name};`),
  ].join('\n');
}

export const PRIMARY_DETECT_JS = primaryDetectSource(PRIMARY_DETECT_PARTS);
