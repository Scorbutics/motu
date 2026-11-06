// THE LAGOON'S SIDE of a region inside a region: a placeholder by default, the region on request.
//
// The parent's region view must not render the child's islands until someone asks — otherwise the
// parent's flows and snapshots are coupled to the child's rendering, which is the independence the
// split exists to buy. Asked, it mounts the child from ITS config with ITS seed. A reference the lagoon
// cannot honour REFUSES (role="alert", no load button) rather than rendering anything in its place.
//
// Driven through the built `@motu/react` (the same mount the gallery and `island verify` use), in
// happy-dom: rendering and a click are all this needs, and both are decidable without a browser.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register({ url: 'http://localhost/?region=parent' });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { mountReactLagoon, createRegion } from '@motu/react';
import { getArchipelagoStore } from '@motu/core';

const ParentLayout = ({ main, panel }) => createElement('main', null, main, createElement('aside', null, panel));
const ChildLayout = ({ body }) => createElement('section', { className: 'child' }, body);
const ParentMain = () => createElement('p', null, 'parent island');
const ChildBody = ({ text }) => createElement('p', null, `child says ${text ?? '(nothing)'}`);

const elements = [
  { tag: 'x-parent-main', component: ParentMain, options: { contract: { input: [] } } },
  { tag: 'x-child-body', component: ChildBody, options: { contract: { input: ['text'] } } },
];

let n = 0;
/** Fresh ids per test: stores are registered globally by id and reused. */
function configs(ref) {
  const k = n++;
  const child = {
    id: `child-${k}`,
    root: ChildLayout,
    slots: { body: `c-body-${k}` },
    islands: [{ slot: `c-body-${k}`, element: 'x-child-body', bind: { text: 'text' } }],
  };
  const parent = {
    id: `parent-${k}`,
    root: ParentLayout,
    slots: { main: `p-main-${k}`, panel: { region: ref ?? child.id } },
    islands: [{ slot: `p-main-${k}`, element: 'x-parent-main' }],
  };
  return { parent, child };
}

const resolverFor = (child) => ({
  resolve: (id) =>
    id === child.id
      ? { ok: true, loaded: { config: child, opts: { elements, seed: { text: 'hello' }, view: 'region' } } }
      : { ok: false, error: `no region "${id}" in this lagoon` },
  href: (id) => `?region=${id}`,
});

async function mount(config, opts) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  await act(async () => {
    mountReactLagoon(el, config, { elements, view: 'region', ...opts });
  });
  return el;
}

test('the parent renders a placeholder naming the child region, not the child', async () => {
  const { parent, child } = configs();
  const el = await mount(parent, { regionRefs: resolverFor(child) });
  const ph = el.querySelector(`[data-motu-region-ref="${child.id}"]`);
  assert.ok(ph, 'a placeholder for the referenced region');
  assert.equal(ph.getAttribute('data-motu-region-ref-state'), 'placeholder');
  assert.match(ph.textContent, new RegExp(`Region ${child.id}`));
  assert.match(ph.textContent, /separate motu region/);
  assert.match(el.textContent, /parent island/, "the parent's own island still renders");
  assert.doesNotMatch(el.textContent, /child says/, "the child's island is NOT rendered by default");
  assert.equal(getArchipelagoStore(child.id), undefined, 'the child region is not even composed until asked');
  const link = ph.querySelector(`a[data-motu-region-ref-open="${child.id}"]`);
  assert.equal(link?.getAttribute('href'), `?region=${child.id}`, "a link to the child's own address");
  // Nothing in the placeholder is counted as one of the parent's slots by the runtime checks.
  assert.equal(ph.querySelector('[data-motu-slot]'), null);
});

test('loading it mounts the child in place, with its own seed — and it can be unloaded', async () => {
  const { parent, child } = configs();
  const el = await mount(parent, { regionRefs: resolverFor(child) });
  const load = el.querySelector(`[data-motu-region-ref-load="${child.id}"]`);
  assert.ok(load, 'a load button');
  await act(async () => {
    load.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.equal(el.querySelector(`[data-motu-region-ref="${child.id}"]`)?.getAttribute('data-motu-region-ref-state'), 'loaded');
  assert.match(el.textContent, /child says hello/, "the child's island, fed from the child's own seed");
  assert.ok(el.querySelector('section.child'), "composed by the child's own root");
  assert.equal(getArchipelagoStore(child.id)?.get('text'), 'hello', "the child's store is its own");
  assert.equal(getArchipelagoStore(parent.id)?.get('text'), undefined, "and the parent's holds none of it");

  const unload = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Unload');
  await act(async () => {
    unload.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  assert.doesNotMatch(el.textContent, /child says/);
  assert.equal(el.querySelector(`[data-motu-region-ref="${child.id}"]`)?.getAttribute('data-motu-region-ref-state'), 'placeholder');
});

test('a reference the lagoon cannot resolve REFUSES — no load button, nothing else rendered', async () => {
  const { parent, child } = configs('nowhere');
  const errors = [];
  const original = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    const el = await mount(parent, { regionRefs: resolverFor(child) });
    const ph = el.querySelector('[data-motu-region-ref="nowhere"]');
    assert.equal(ph?.getAttribute('data-motu-region-ref-state'), 'refused');
    assert.equal(ph.getAttribute('role'), 'alert');
    assert.match(ph.textContent, /no region "nowhere"/);
    assert.equal(ph.querySelector('button'), null, 'nothing to load');
    assert.doesNotMatch(el.textContent, /child says/);
    assert.ok(errors.some((e) => /refused/.test(e)), 'said in the console too');
  } finally {
    console.error = original;
  }
});

test('with no resolver (the focused entry) it still names the region and says it cannot load here', async () => {
  const { parent, child } = configs();
  const el = await mount(parent, {});
  const ph = el.querySelector(`[data-motu-region-ref="${child.id}"]`);
  assert.equal(ph?.getAttribute('data-motu-region-ref-state'), 'placeholder');
  assert.match(ph.textContent, /cannot be loaded in this view/);
  assert.equal(ph.querySelector('button'), null);
});

test('the mountpoints view frames the reference without making it one of the parent slots', async () => {
  const { parent, child } = configs();
  const el = await mount(parent, { view: 'mountpoints', regionRefs: resolverFor(child) });
  const frame = el.querySelector('[data-motu-region-slot="panel"]');
  assert.ok(frame, 'a frame for the region slot');
  assert.equal(frame.getAttribute('data-motu-slot'), null);
  assert.ok(frame.querySelector(`[data-motu-region-ref="${child.id}"]`));
  assert.deepEqual(
    // A set: the frame and the island inside it both carry the attribute.
    [...new Set([...el.querySelectorAll('[data-motu-slot]')].map((x) => x.getAttribute('data-motu-slot')))],
    [parent.islands[0].slot],
    'only the parent island is a mounted slot',
  );
});

test('the page: <X.Root> passes the child region through, unwrapped by any island of the parent', async () => {
  const { parent, child } = configs();
  const Parent = createRegion(parent, { elements });
  const Child = createRegion(child, { elements, seed: { text: 'from the page' } });
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      createElement(
        Parent.Region,
        null,
        createElement(Parent.Root, {
          main: createElement(ParentMain),
          panel: createElement(Child.Region, null, createElement(Child.Root, { body: createElement(ChildBody, { text: 'from the page' }) })),
        }),
      ),
    );
  });
  assert.match(el.textContent, /child says from the page/);
  const aside = el.querySelector('aside');
  // The prop holds the child's own composition: its island is the CHILD's slot, never a parent one.
  const slots = [...aside.querySelectorAll('[data-motu-slot]')].map((x) => x.getAttribute('data-motu-slot'));
  assert.ok(!slots.includes(parent.islands[0].slot));
  assert.ok(!slots.some((s) => s.startsWith('p-')), `no parent island wraps the region: ${slots}`);
});
