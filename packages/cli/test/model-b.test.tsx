// Model B — "the page seeds, the store augments" — under test.
//
// This is the one behaviour in motu with no single owner: it lives across the Store's precedence rule,
// the Island's publish effect, and the output wrapping. Each is a couple of lines; together they decide
// whether removing motu from a host page is a no-op or a breakage. So they are asserted, not reasoned
// about.
//
// Run: node --import tsx packages/react/test/model-b.test.tsx   (from the motu checkout)
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import { createElement as h, act } from 'react';
import { createRoot } from 'react-dom/client';

// React only batches effects inside act() when the environment opts in; without this the publish
// effect below has not run by the time the assertions read the store, and the test passes or fails
// on timing rather than on behaviour.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { ArchipelagoProvider, Island } from '../../react/src/react-island';
import { getArchipelagoStore } from '@motu/core';
import type { ArchipelagoConfig } from '@motu/core';
import type { ElementSpec } from '../../react/src/bootstrap';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + detail}`);
  if (!cond) failures++;
}

/** The app's own component. It knows nothing about motu — that is the point. */
function Panel({ label = '(default)', onPicked }: { label?: string; onPicked?: (v: unknown) => void }) {
  return h('button', { onClick: () => onPicked?.('from-panel') }, label);
}

const elements: ElementSpec[] = [{ tag: 'x-panel', component: Panel, options: { contract: { input: ['label'], output: { onPicked: 'picked' } } } }];

let regionWrites: unknown[] = [];
const config: ArchipelagoConfig = {
  id: 'test-region',
  islands: [{ slot: 'panel', element: 'x-panel', bind: { label: 'panelLabel' }, on: { picked: (d) => regionWrites.push(d) } }],
};

const host = document.createElement('div');
document.body.appendChild(host);
const root = createRoot(host);

function render(child: React.ReactNode) {
  act(() => {
    root.render(h(ArchipelagoProvider, { config, elements, children: h(Island, { slot: 'panel' }, child) } as never));
  });
}

console.log('\nModel B — page seeds, store augments\n');

// 1. The page's own prop reaches the render when nothing has written the store.
let pageCalls: unknown[] = [];
render(h(Panel, { label: 'from-page', onPicked: (v: unknown) => pageCalls.push(v) }));
check('page prop renders', host.textContent === 'from-page', `got "${host.textContent}"`);

// 2. ...and it was PUBLISHED to the store under the bind key, so a sibling can read it.
const store = getArchipelagoStore('test-region')!;
check('page prop published to the store', store.get('panelLabel') === 'from-page', String(store.get('panelLabel')));

// 3. A sibling writing the bound key OVERRIDES the page's prop.
act(() => store.set('panelLabel', 'from-sibling'));
check('store augments (sibling wins)', host.textContent === 'from-sibling', `got "${host.textContent}"`);

// 4. `undefined` written deliberately is honoured — this is what has() buys over a value test.
act(() => store.set('panelLabel', undefined));
check('explicit undefined is honoured, not ignored', host.textContent === '(default)', `got "${host.textContent}"`);

// 5. The page's OWN callback still fires, and so does the archipelago's handler.
act(() => store.set('panelLabel', 'clickable'));
pageCalls = [];
regionWrites = [];
act(() => {
  (host.querySelector('button') as HTMLButtonElement).click();
});
check('page callback still fires', pageCalls.length === 1, JSON.stringify(pageCalls));
check('archipelago handler also fires', regionWrites.length === 1, JSON.stringify(regionWrites));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL — ' + failures + ' assertion(s)'}\n`);
process.exit(failures === 0 ? 0 : 1);
