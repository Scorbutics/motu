// A lone island's page props are its STARTING STATE, and a scenario can still move them.
//
// The focused lagoon entry (`lagoon.html`, what every `island verify` / snapshot drives) mounts one
// island through a synthesised one-slot region. The real region's per-slot `props` — what the page
// passes on the element, e.g. `view="identity"` — reached that island as static props, and `<Island>`
// applies static props AFTER its store binds. So `provide('view', 'social')` changed the store and
// nothing on screen: a data-flow run reported "5 scenarios, 3 distinct renders" for a panel whose
// "networks" scenario was silently rendering its identity face, while the gallery (which passes no
// props) showed the right one. Now those props are seeded underneath the seed (`loneIslandSeed`).
//
// Run: node --import tsx packages/cli/test/lone-island-page-props.test.tsx   (from the motu checkout)
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

import * as React from 'react';
import { createElement as h, act } from 'react';
import type { ElementSpec } from '../../react/src/bootstrap';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// `lagoon-react-mount.tsx` is JSX, and tsx compiles it with the classic transform here — `React` must
// be in scope before it is evaluated, hence a global and dynamic imports below.
(globalThis as unknown as { React: typeof React }).React = React;
const { mountReactLagoon } = await import('../../react/src/lagoon-react-mount');
const { lagoonArchipelagoConfig } = await import('../../react/src/bootstrap');
const { loneIslandSeed } = await import('../../react/src/lagoon-bootstrap');
const { provideToArchipelago } = await import('@motu/core');

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + detail}`);
  if (!cond) failures++;
}

/** Two faces of one component, chosen by a prop the page passes. */
function Panel({ view = 'both' }: { view?: string }) {
  return h('p', null, `face:${view}`);
}
const elements: ElementSpec[] = [{ tag: 'x-panel', component: Panel, options: { contract: { input: ['view'], output: {} } } }];
const target = { kind: 'island', tag: 'x-panel' } as const;
const pageProps = { view: 'identity' };

console.log('\nLone island — page props seed, scenarios move them\n');

// The precedence itself: page props underneath, the seed on top, key by key.
check('no seed → page props', JSON.stringify(loneIslandSeed(undefined, pageProps)) === '{"view":"identity"}');
check('seed wins over page props', loneIslandSeed({ view: 'social' }, pageProps)?.view === 'social');
check('no page props → seed untouched', loneIslandSeed({ a: 1 }, undefined)?.a === 1);

// Mounted the way the focused entry mounts a lone island now.
const el = document.createElement('div');
document.body.appendChild(el);
const seed = loneIslandSeed(undefined, pageProps);
const config = lagoonArchipelagoConfig(target, { elements, seed });
act(() => mountReactLagoon(el, config, { elements, seed: seed ?? {} }));
check('the page prop renders by default', el.textContent === 'face:identity', `got "${el.textContent}"`);

// What a data-flow scenario does: provide its own value. It must reach the render.
act(() => provideToArchipelago(config.id, 'view', 'social'));
check('a scenario value reaches the render', el.textContent === 'face:social', `got "${el.textContent}"`);

// Re-aiming to ANOTHER lone island must not inherit this one's keys. The id used to be the constant
// 'lagoon', a store is reused by id, and an island mounted after another read that island's rows.
const { getArchipelagoStore } = await import('@motu/core');
const next = lagoonArchipelagoConfig({ kind: 'island', tag: 'x-other' } as const, { elements, seed: {} });
check('each lone mount gets its own archipelago id', next.id !== config.id, `${next.id} vs ${config.id}`);
act(() => mountReactLagoon(el, next, { elements, seed: {} }));
check('the next lone mount starts with an empty store', getArchipelagoStore(next.id)?.get('view') === undefined,
  String(getArchipelagoStore(next.id)?.get('view')));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL — ' + failures + ' assertion(s)'}\n`);
process.exit(failures === 0 ? 0 : 1);
