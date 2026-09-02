// The colour detector, driven by pixel buffers rather than a browser.
//
// Every case here is a REAL artifact's behaviour reduced to the buffer that produced it. The two
// that matter most are named after the lagoons they came from: twenty rasterises to zero chromatic
// pixels and must still answer, and motu-demo-app's banner must beat the far larger area of page
// ground around it.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  dominantPrimary, normalisePrimary, primaryVars, PRIMARY_VAR_NAMES,
  parseHex, hexOf, rgbToHsl, hslToRgb, contrastRatio,
  PRIMARY_DETECT_JS, primaryDetectSource,
} from '../src/primary.mjs';

/** One 8-bit channel step, as an HSL tolerance -- see the too-light-brand test for why it is here. */
const QUANT = 1 / 255;

/** A buffer made of [hex, count] runs, so a test reads as the composition of a screen. */
function buffer(runs) {
  const total = runs.reduce((n, [, c]) => n + c, 0);
  const data = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [hex, count] of runs) {
    const [r, g, b] = hex === 'transparent' ? [0, 0, 0] : parseHex(hex);
    const a = hex === 'transparent' ? 0 : 255;
    for (let n = 0; n < count; n++) { data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = a; }
  }
  return data;
}

test('hex and hsl round-trip', () => {
  assert.equal(hexOf(18, 152, 143), '#12988f');
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.equal(parseHex('not a colour'), null);
  const { h, s, l } = rgbToHsl(18, 152, 143);
  assert.equal(hexOf(...hslToRgb(h, s, l)), '#12988f');
});

test("a brand beats the page ground it sits on -- motu-demo-app's banner", () => {
  // The screen is mostly near-white with a teal banner and a teal button: a small minority by area.
  const found = dominantPrimary(buffer([['#f7f9f8', 9000], ['#12988f', 800], ['#189888', 200]]));
  assert.equal(found.neutral, false);
  const { h } = rgbToHsl(...parseHex(found.hex));
  assert.ok(Math.abs(h - 174) < 8, 'kept the teal hue, got h=' + h);
});

test('a greyscale lagoon answers with a grey rather than giving up -- twenty', () => {
  // Twenty's artifact: near-white ground, grey text, no chromatic pixels anywhere.
  const found = dominantPrimary(buffer([['#f7f7f7', 9000], ['#333333', 900], ['#eeeeee', 100]]));
  assert.equal(found.neutral, true);
  assert.equal(found.chromaticFraction, 0);
  assert.equal(found.hex, '#333333');
});

test('near-white ground is never the neutral answer', () => {
  // If the ground counted, every greyscale app would come back as the colour of paper.
  const found = dominantPrimary(buffer([['#fbfbfb', 9900], ['#3a3a3a', 100]]));
  assert.equal(found.neutral, true);
  const { l } = rgbToHsl(...parseHex(found.hex));
  assert.ok(l < 0.5, 'answered with a foreground grey, not the page, got l=' + l);
});

test('one hue spread across a gradient counts once, not as a dozen shades', () => {
  // An antialiased banner is hundreds of near-identical colours. Bucketing by hue keeps them one
  // vote; bucketing by RGB would split them and let a smaller flat colour win.
  const ramp = [];
  for (let n = 0; n < 40; n++) ramp.push([hexOf(18 + n, 152 - n, 143 - n), 20]);
  const found = dominantPrimary(buffer([...ramp, ['#c04000', 500], ['#f7f7f7', 5000]]));
  const { h } = rgbToHsl(...parseHex(found.hex));
  assert.ok(Math.abs(h - 174) < 12, 'the 800 gradient pixels beat the 500 flat ones, got h=' + h);
});

test('a transparent buffer has no answer', () => {
  assert.equal(dominantPrimary(buffer([['transparent', 500]])), null);
});

test('motu teal survives normalisation unchanged', () => {
  // The ramp was designed around this colour, so it must already sit inside the clamp band -- if it
  // did not, a lagoon that IS motu teal would be repainted a different teal.
  const { primary } = normalisePrimary('#12988f');
  const a = parseHex('#12988f'), b = parseHex(primary);
  assert.ok(Math.max(...a.map((v, i) => Math.abs(v - b[i]))) <= 2, 'got ' + primary);
});

test('a too-light brand is darkened, keeping its hue -- the correction acme made by hand', () => {
  const raw = '#f5c542';
  const { primary } = normalisePrimary(raw);
  const before = rgbToHsl(...parseHex(raw));
  const after = rgbToHsl(...parseHex(primary));
  assert.ok(after.l < before.l, 'darkened: ' + before.l + ' -> ' + after.l);
  assert.ok(Math.abs(after.h - before.h) < 2, 'kept the hue');
  // QUANT is 8-bit rounding: hslToRgb lands on integer channels, so a round-trip cannot hit a clamp
  // bound exactly and lands within about one channel step of it. Asserting the exact bound fails on
  // arithmetic rather than on behaviour.
  assert.ok(after.l <= 0.52 + QUANT, 'landed inside the band, got l=' + after.l);
});

test('a washed-out brand is saturated up to something the ramp can carry', () => {
  const before = rgbToHsl(...parseHex('#9aa8a6'));
  const { primary } = normalisePrimary('#9aa8a6');
  const after = rgbToHsl(...parseHex(primary));
  assert.ok(after.s > before.s, 'saturated up: ' + before.s + ' -> ' + after.s);
  assert.ok(after.s >= 0.35 - QUANT, 'reached the floor, got ' + primary + ' s=' + after.s);
});

test('a neutral stays neutral -- it is not tinted into a colour it never had', () => {
  const { primary, neutral } = normalisePrimary('#333333', { neutral: true });
  assert.equal(neutral, true);
  const [r, g, b] = parseHex(primary);
  assert.ok(r === g && g === b, 'no hue invented, got ' + primary);
});

test('onPrimary is legible on whatever primary came back', () => {
  for (const raw of ['#12988f', '#f5c542', '#333333', '#c04000', '#4488ff', '#1c9081']) {
    const { primary, onPrimary } = normalisePrimary(raw);
    const ratio = contrastRatio(parseHex(primary), parseHex(onPrimary));
    assert.ok(ratio >= 3, raw + ' -> ' + primary + ' on ' + onPrimary + ' is only ' + ratio.toFixed(2) + ':1');
  }
});

test("a mid-tone brand keeps WHITE on it, the way motu's own masthead does", () => {
  // THE REGRESSION FOR THE CONTRAST TARGET. At 4.5:1 white fails on motu's own #12988f (3.97:1) and
  // every mid-tone brand flips to dark text -- which is what the first run against the real
  // motu-demo-app artifact did, returning dark text on its teal banner. If someone raises the bar,
  // this is the test that says what it costs.
  for (const raw of ['#12988f', '#1c9081', '#c04000', '#4488ff']) {
    assert.equal(normalisePrimary(raw).onPrimary, '#ffffff', raw + ' should carry white');
  }
});

test('a pale or greyscale primary takes dark text instead', () => {
  // The other side of the same decision: 3:1 is a threshold, not a preference for white.
  const pale = normalisePrimary('#f5c542');
  assert.equal(pale.onPrimary, '#101413');
  assert.ok(contrastRatio(parseHex(pale.primary), parseHex(pale.onPrimary)) >= 3);
});

test('the sampling band and the output clamp do not share a name', () => {
  // THE REGRESSION FOR A BUG THAT LOOKED LIKE A RESULT. detectPrimary hands ONE opts object to both
  // dominantPrimary and normalisePrimary. While both called their neutral bounds neutralLightMin/Max,
  // widening the sampling band also disabled the output clamp, and every detected colour came back
  // raw -- visible only as "the tuning sweep changed nothing about normalisation".
  const found = dominantPrimary(buffer([['#fbfbfb', 9000], ['#b7b7b7', 1000]]), { neutralSampleMax: 0.8 });
  assert.equal(found.hex, '#b7b7b7', 'the sampling option is what widened the band');
  const { primary } = normalisePrimary(found.hex, { neutral: true, neutralSampleMax: 0.8 });
  const { l } = rgbToHsl(...parseHex(primary));
  assert.ok(l <= 0.40 + QUANT, 'the clamp still applied, got ' + primary + ' l=' + l);
});

test('normalisation refuses a value that is not a colour', () => {
  assert.equal(normalisePrimary('var(--something)'), null);
});

test('the var map is the ramp applyMotuChrome builds', () => {
  const vars = primaryVars('#12988f', '#ffffff');
  assert.equal(vars['--motu-primary'], '#12988f');
  assert.equal(vars['--motu-water-mid'], '#12988f');
  assert.equal(vars['--motu-primary-deep'], 'color-mix(in srgb, #12988f 78%, #000)');
  assert.equal(vars['--motu-surface-page'], 'color-mix(in srgb, #12988f 8%, #fff)');
  assert.equal(vars['--motu-line'], 'color-mix(in srgb, #12988f 14%, transparent)');
  assert.equal(vars['--motu-on-primary'], '#ffffff');
  // Every name the applier can set has to be clearable, or leaving a project keeps its colour.
  for (const name of Object.keys(vars)) {
    if (name === '--motu-on-primary') continue;
    assert.ok(PRIMARY_VAR_NAMES.includes(name), name + ' is set but not in PRIMARY_VAR_NAMES');
  }
});

test('the browser bundle defines the names the page calls', () => {
  const ctx = {};
  vm.createContext(ctx);
  new vm.Script(PRIMARY_DETECT_JS).runInContext(ctx);
  for (const name of ['detectPrimary', 'detectPrimarySettled', 'primaryVars', 'dominantPrimary']) {
    assert.equal(typeof ctx[name], 'function', name + ' is missing from the bundle');
  }
});

test('a bundler that renames the functions cannot break the caller', () => {
  // THE PRODUCTION BUG, reproduced. The host app is minified, so the serialised functions arrive
  // under mangled names while the page's own script -- a template literal -- still calls the real
  // ones. Every check passed and the deployed page threw "detectPrimary is not defined" on the
  // first frame it tried to read.
  function fe(x) { return x * 2; }
  function ge(x) { return fe(x) + 1; }
  const src = primaryDetectSource({ dominantPrimary: fe, detectPrimary: ge });
  const ctx = {};
  vm.createContext(ctx);
  new vm.Script(src).runInContext(ctx);
  assert.equal(typeof ctx.detectPrimary, 'function', 'the caller\'s name has to resolve');
  assert.equal(ctx.detectPrimary(3), 7, 'and it has to be the right function');
});

test('nothing is aliased when nothing was renamed', () => {
  function detectPrimary(x) { return x; }
  assert.equal(primaryDetectSource({ detectPrimary }).includes('var detectPrimary ='), false);
});
