// WHAT AN ISLAND RENDERED includes what its own mount PORTALED — and nothing else.
//
// `data-flow` and `remount-stable` compare an island's render. An island whose output is a dialog
// (Radix / vaul portal to <body>) was "rendered NOTHING" there, while the region flow asserting that
// dialog's text passed. The fix counts body-level nodes only when React ancestry ties them to THIS
// island's mount; these tests pin both halves: what is counted, and what must never be.
//
// The installer is exercised through its SERIALISED form (`toString()` re-evaluated with no scope),
// because that is how Playwright's `addInitScript` ships it into the page: a helper it closed over
// would work here and be undefined in the browser.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost/?target=island:x' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { mountReactLagoon } from '@motujs/react';
import { installIslandRender } from '../src/lib/island-render.mjs';

const install = new Function(`return (${installIslandRender.toString()})`)();
install(window);

/** A dialog-only island: no own DOM, its whole output portaled to <body> — the shape of a closed-by-default sheet. */
const DialogA = ({ text }) =>
  text ? createPortal(createElement('div', { role: 'dialog' }, `Dialog A: ${text}`), document.body) : null;
const DialogB = ({ text }) =>
  text ? createPortal(createElement('div', { role: 'dialog' }, `Dialog B: ${text}`), document.body) : null;
/** Renders nothing at all, anywhere. */
const Nothing = () => null;

const elements = [
  { tag: 'x-dialog-a', component: DialogA, options: { contract: { input: ['text'] } } },
  { tag: 'x-dialog-b', component: DialogB, options: { contract: { input: ['text'] } } },
  { tag: 'x-nothing', component: Nothing, options: { contract: { input: [] } } },
];

let n = 0;
async function mountRegion(islands, seed) {
  const k = n++;
  const Layout = (props) => createElement('main', null, ...Object.values(props));
  const config = {
    id: `portal-${k}`,
    root: Layout,
    slots: Object.fromEntries(islands.map((i) => [i.slot, `${i.slot}-${k}`])),
    islands: islands.map((i) => ({ slot: `${i.slot}-${k}`, element: i.element, bind: i.bind })),
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    mountReactLagoon(host, config, { elements, view: 'region', seed });
  });
  return host;
}

const island = (tag) => document.querySelector(`[data-motu-island="${tag}"]`);

function reset() {
  document.body.replaceChildren();
}

test("an island's portaled output is counted as its render", async () => {
  reset();
  await mountRegion([{ slot: 'a', element: 'x-dialog-a', bind: ['text'] }], { text: 'engine' });
  const el = island('x-dialog-a');
  assert.ok(el, 'the island wrapper exists');
  assert.equal(el.innerHTML, '', 'its own subtree is empty — the old reading saw NOTHING');
  const parts = window.__motuRenderedParts(el);
  assert.equal(parts.portals.length, 1);
  assert.match(window.__motuRendered(el), /Dialog A: engine/);
  assert.equal(window.__motuPortals(el).length, 1);
});

test('two seeds of a dialog-only island render DIFFERENTLY — the data-flow comparison can pass', async () => {
  reset();
  await mountRegion([{ slot: 'a', element: 'x-dialog-a', bind: ['text'] }], { text: 'engine' });
  const one = window.__motuRendered(island('x-dialog-a'));
  reset();
  await mountRegion([{ slot: 'a', element: 'x-dialog-a', bind: ['text'] }], { text: 'empty' });
  const two = window.__motuRendered(island('x-dialog-a'));
  assert.ok(one.trim() && two.trim());
  assert.notEqual(one, two);
});

test('lagoon chrome and nodes that existed before the mount are NOT counted', async () => {
  reset();
  // Pre-existing furniture, the way the lagoon draws it: vanilla DOM on <body>.
  const before = document.createElement('div');
  before.textContent = 'GET /rest/v1/spheres';
  document.body.appendChild(before);
  const dock = document.createElement('div');
  dock.setAttribute('data-motu-chrome', '');
  dock.textContent = 'Seams · Feeds';
  document.body.appendChild(dock);

  await mountRegion([{ slot: 'a', element: 'x-dialog-a', bind: ['text'] }], { text: 'engine' });
  // Drawn AFTER the mount too: being later is not being owned.
  const toast = document.createElement('div');
  toast.textContent = 'POST /rest/v1/rpc/x';
  document.body.appendChild(toast);
  // A chrome container that itself holds React-rendered content (fibers that are NOT the island's).
  const chromeRoot = document.createElement('div');
  chromeRoot.setAttribute('data-motu-chrome', '');
  document.body.appendChild(chromeRoot);
  await act(async () => createRoot(chromeRoot).render(createElement('p', null, 'dock panel')));

  const html = window.__motuRendered(island('x-dialog-a'));
  assert.match(html, /Dialog A: engine/);
  for (const furniture of ['GET /rest/v1/spheres', 'Seams', 'POST /rest/v1/rpc/x', 'dock panel']) {
    assert.ok(!html.includes(furniture), `"${furniture}" must not be attributed to the island`);
  }
  assert.equal(window.__motuPortals(island('x-dialog-a')).length, 1);
});

test('an island that renders nothing still reads as EMPTY, with portals and chrome all around it', async () => {
  reset();
  const dock = document.createElement('div');
  dock.setAttribute('data-motu-chrome', '');
  dock.textContent = 'dock';
  document.body.appendChild(dock);
  await mountRegion(
    [
      { slot: 'n', element: 'x-nothing' },
      { slot: 'b', element: 'x-dialog-b', bind: ['text'] },
    ],
    { text: 'neighbour' },
  );
  assert.match(document.body.textContent, /Dialog B: neighbour/, 'a portal IS on the page');
  const el = island('x-nothing');
  assert.ok(el);
  assert.equal(window.__motuRendered(el), '', 'and none of it is the empty island’s');
  assert.equal(window.__motuPortals(el).length, 0);
});

test('a portal opened by a DIFFERENT mount is not attributed', async () => {
  reset();
  await mountRegion(
    [
      { slot: 'a', element: 'x-dialog-a', bind: ['text'] },
      { slot: 'b', element: 'x-dialog-b', bind: ['text'] },
    ],
    { text: 'shared' },
  );
  const a = window.__motuRendered(island('x-dialog-a'));
  const b = window.__motuRendered(island('x-dialog-b'));
  assert.match(a, /Dialog A: shared/);
  assert.doesNotMatch(a, /Dialog B/);
  assert.match(b, /Dialog B: shared/);
  assert.doesNotMatch(b, /Dialog A/);

  // A separate React root (another mount) portaling to <body> — same page, not this island's.
  const other = document.createElement('div');
  document.body.appendChild(other);
  await act(async () =>
    createRoot(other).render(createPortal(createElement('div', null, 'Other mount dialog'), document.body)),
  );
  assert.doesNotMatch(window.__motuRendered(island('x-dialog-a')), /Other mount dialog/);
});

test('a previous mount of the same island is a different mount', async () => {
  reset();
  // The old wrapper element is gone; a node it portaled that somehow lingered must not be the new one's.
  const stale = document.createElement('div');
  document.body.appendChild(stale);
  const staleIsland = document.createElement('div');
  stale.appendChild(staleIsland);
  const Stale = () => createElement('div', { 'data-motu-island': 'x-dialog-a' }, createPortal(createElement('div', null, 'stale dialog'), document.body));
  await act(async () => createRoot(staleIsland).render(createElement(Stale)));
  const old = stale.querySelector('[data-motu-island="x-dialog-a"]');
  stale.remove(); // the old mount's tree detached; its portal node is still on <body>
  assert.match(document.body.textContent, /stale dialog/);

  await mountRegion([{ slot: 'a', element: 'x-dialog-a', bind: ['text'] }], { text: 'fresh' });
  const fresh = island('x-dialog-a');
  assert.notEqual(fresh, old);
  const html = window.__motuRendered(fresh);
  assert.match(html, /Dialog A: fresh/);
  assert.doesNotMatch(html, /stale dialog/);
});

test('custom-element path: a React root mounted INSIDE the island owns the portals it opens', async () => {
  reset();
  const el = document.createElement('x-ce-island');
  document.body.appendChild(el);
  const shadow = el.attachShadow({ mode: 'open' });
  const container = document.createElement('div');
  shadow.appendChild(container);
  const Sheet = () => createElement('span', null, 'own', createPortal(createElement('aside', null, 'Sheet body'), document.body));
  await act(async () => createRoot(container).render(createElement(Sheet)));
  const html = window.__motuRendered(el);
  assert.match(html, /own/);
  assert.match(html, /Sheet body/);
  assert.equal(window.__motuPortals(el).length, 1);
});

test('a library-created portal CONTAINER (no fiber of its own) is attributed through its content', async () => {
  reset();
  const Lib = () => {
    const [box, setBox] = useState(null);
    useEffect(() => {
      const d = document.createElement('div');
      d.className = 'lib-portal-root';
      document.body.appendChild(d);
      setBox(d);
      return () => d.remove();
    }, []);
    return box ? createPortal(createElement('div', null, 'Drawer content'), box) : null;
  };
  const extra = [...elements, { tag: 'x-lib', component: Lib, options: { contract: { input: [] } } }];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const k = n++;
  await act(async () => {
    mountReactLagoon(
      host,
      { id: `lib-${k}`, root: ({ a }) => createElement('main', null, a), slots: { a: `a-${k}` }, islands: [{ slot: `a-${k}`, element: 'x-lib' }] },
      { elements: extra, view: 'region' },
    );
  });
  const el = island('x-lib');
  assert.match(window.__motuRendered(el), /Drawer content/);
  assert.equal(window.__motuPortals(el)[0].className, 'lib-portal-root');
});
