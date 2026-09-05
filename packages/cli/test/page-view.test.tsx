// THE PAGE VIEW, which is the only lagoon view that owns a PAGE'S LIFECYCLE.
//
// Every other view mounts ISLANDS: motu supplies the provider, the seed and the arrangement, and what
// is proved is that the islands work. Nothing there creates the page component, so nothing there runs
// the page's `useMemo`, its effects, or the cleanup between them.
//
// THE BUG THAT EARNED THIS FILE, from a real application: a page created a data source in `useMemo`,
// let it start loading, and disposed it in the effect's cleanup. React StrictMode runs effects
// mount → cleanup → mount, so the simulated unmount killed the instance the page then went on using —
// the first load's answers were dropped by the source's own generation guard, nothing restarted it,
// and the screen kept its spinner for ever. Every motu check was green, because the lagoon installs a
// source through a CHANNEL and no React component owns it there.
//
// So this view now mounts under StrictMode, and these two tests are what that buys.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act, useEffect, useMemo, useSyncExternalStore } from 'react';
import { defineArchipelago, getArchipelagoStore } from '@motu/core';
import { mountReactLagoon } from '../../react/src/lagoon-react-mount';

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

/** A source with the shape the real one had: it starts on creation and is disposed on teardown. */
function makeSource(opts: { restartable: boolean }) {
  let state = { loading: true, loads: 0 };
  let disposed = false;
  let started = false;
  const listeners = new Set<() => void>();
  const api = {
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getState: () => state,
    load() {
      const mine = ++gen;
      // A MACROTASK, because a real fetch is one. A microtask would resolve inside the very act()
      // that mounts, i.e. BEFORE StrictMode's cleanup — and the bug would not reproduce for a reason
      // that has nothing to do with the bug.
      setTimeout(() => {
        if (mine !== gen) return;          // the generation guard, as the real source has
        state = { loading: false, loads: state.loads + 1 };
        listeners.forEach((l) => l());
      }, 0);
    },
    /** The fix: idempotent while alive, reviving after a dispose. */
    start() {
      if (!opts.restartable) return;       // the BROKEN shape: creation loads, nothing revives it
      if (started && !disposed) return;
      started = true; disposed = false;
      api.load();
    },
    dispose() { disposed = true; gen++; listeners.clear(); },
  };
  let gen = 0;
  started = true;
  api.load();                              // creation starts it — a channel cannot ask
  return api;
}

const mount = async (restartable: boolean) => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const source = makeSource({ restartable });
  const Page = () => {
    const s = useMemo(() => source, []);
    useEffect(() => {
      s.start();
      return () => s.dispose();
    }, [s]);
    const { loading } = useSyncExternalStore(s.subscribe, s.getState, s.getState);
    return <b data-testid="state">{loading ? 'Chargement…' : 'loaded'}</b>;
  };
  const config = { id: `page-${restartable}`, islands: [] } as never;
  defineArchipelago(config, { elements: {} } as never);
  await act(async () => {
    mountReactLagoon(el, config, { view: 'page', page: Page, elements: {} } as never);
  });
  // Let the load land, the way it would over a network.
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return el;
};

// ── the bug, reproduced through the real view ────────────────────────────────────────────────
{
  const el = await mount(false);
  t('StrictMode catches a page that never recovers from its own teardown',
    el.textContent?.includes('Chargement'), String(el.textContent));
}

// ── and the fixed shape passing ──────────────────────────────────────────────────────────────
{
  const el = await mount(true);
  t('...and a page that restarts on remount renders', el.textContent?.includes('loaded'), String(el.textContent));
}

// ── channels fire here now ───────────────────────────────────────────────────────────────────
{
  // They did not, and the doc said so: a channel is installed by motu's own provider, which this view
  // deliberately does not mount. So a region fed by a channel rendered with those keys unset and
  // `page-render` could report a slot as unreached when the truth was that nothing fed it. The store
  // is module state keyed by archipelago id, so they can be installed against it once the page's own
  // region has registered — which is what this asserts.
  const el = document.createElement('div');
  document.body.appendChild(el);
  const config = { id: 'page-channels', islands: [] } as never;
  defineArchipelago(config, { elements: {} } as never);
  const Page = () => <b>page</b>;
  let fired = 0;
  const channel = ({ store }: { store: { set: (k: string, v: unknown) => void } }) => {
    fired++;
    store.set('fedByChannel', 'yes');
  };
  await act(async () => {
    mountReactLagoon(el, config, { view: 'page', page: Page, elements: {}, channels: [channel] } as never);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  t('a channel installed for the page view fires', fired === 1, `${fired} time(s)`);
  t('...and its key reaches the region store',
    getArchipelagoStore('page-channels')?.get('fedByChannel') === 'yes',
    String(getArchipelagoStore('page-channels')?.get('fedByChannel')));
}

console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
