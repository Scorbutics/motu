// DOCKS AT RUNTIME — does `<A.Root>` put A's island where the declarations say, through a real React
// tree, at every moment of the B lifecycle?
//
//   B absent                         -> A's fallback (the claim's own prop)
//   B's <Region> mounted, root not   -> nowhere (waiting — it must never be seen at the fallback first)
//   B's root rendered                -> inside B's dock, once, still A's island (A's region, A's store)
//   B gone again                     -> back at the fallback
//   server render                    -> nowhere (decided on the client, before the first paint)
//
// Run: npx tsx packages/cli/test/docks-runtime.tsx   (CI runs it through docks-runtime.test.mjs)
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createRegion } from '../../react/src/create-region';
import { awaitRegionView } from '../../react/src/lagoon-player';

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

const Column = ({ label }: { label?: string }) => <aside data-block="column">column {label}</aside>;
const Rocket = () => <div data-block="rocket">rocket</div>;
const elements = [
  { tag: 'x-column', component: Column, options: { contract: { input: ['label'] } } },
  { tag: 'x-rocket', component: Rocket, options: {} },
] as never[];

// A's layout: the claim's prop at its FALLBACK position, the B region in its own prop. No portal, no ref.
function BaseLayout({ conseil, panel }: { conseil?: ReactNode; panel?: ReactNode }) {
  return (
    <div data-part="base">
      <div data-part="base-top">{conseil}</div>
      {panel}
    </div>
  );
}
// B's layout: the dock is a root prop like any other.
function CrewLayout({ rocket, aside }: { rocket?: ReactNode; aside?: ReactNode }) {
  return (
    <section data-part="crew">
      {rocket}
      <div data-part="crew-aside">{aside}</div>
    </section>
  );
}

let n = 0;
function regions(fallback?: 'none') {
  const id = n++;
  const a = `base${id}`;
  const b = `crew${id}`;
  const aConfig = {
      id: a,
      root: BaseLayout,
      slots: {
        conseil: { slot: 'col', dockInto: { region: b, dock: 'crew-aside', ...(fallback ? { fallback } : {}) } },
        panel: { region: b },
      },
      islands: [{ slot: 'col', element: 'x-column' }],
  };
  const bConfig = { id: b, root: CrewLayout, slots: { rocket: 'rocket', aside: { dock: 'crew-aside' } }, islands: [{ slot: 'rocket', element: 'x-rocket' }] };
  const A = createRegion(aConfig as never, { elements });
  const B = createRegion(bConfig as never, { elements });
  return { A, B, a, b, aConfig, bConfig };
}

function where(root: HTMLElement, a: string) {
  const els = [...root.querySelectorAll(`[data-motu-slot="col"][data-motu-region="${a}"]`)];
  return els.map((el) => {
    const dock = el.closest('[data-motu-region-dock]');
    return dock ? `dock:${dock.getAttribute('data-motu-region-dock')}` : el.closest('[data-part="base-top"]') ? 'fallback' : 'elsewhere';
  });
}

async function main() {
  // --- B absent, then present, then loaded, then gone --------------------------------------------
  {
    const { A, B, a, b, aConfig, bConfig } = regions();
    let setStage: (s: 'absent' | 'loading' | 'loaded') => void = () => {};
    // Every place the island was ever SEEN — committed DOM, sampled after each commit.
    const seen: string[] = [];
    function Crew({ loaded }: { loaded: boolean }) {
      return <B.Region>{loaded ? <B.Root rocket={<Rocket />} /> : null}</B.Region>;
    }
    function Page() {
      const [stage, set] = useState<'absent' | 'loading' | 'loaded'>('absent');
      setStage = set;
      return (
        <A.Region>
          <A.Root conseil={<Column label="mine" />} panel={stage === 'absent' ? null : <Crew loaded={stage === 'loaded'} />} />
        </A.Region>
      );
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const observer = new MutationObserver(() => seen.push(where(host, a).join(',') || 'nowhere'));
    observer.observe(host, { childList: true, subtree: true });

    await act(async () => root.render(<Page />));
    t('B absent: the island renders at its fallback', where(host, a).join() === 'fallback', where(host, a).join());
    // The PLAIN region view's outcome (`?region=<a>`, no state) — what `__motuLagoonState` reports.
    {
      const v = await awaitRegionView(aConfig as never, 'region', 500);
      const row = v.docks?.[0] as { slot?: string; placed?: string } | undefined;
      t('region view: reported as kind "region", named, with the view', v.ok && v.kind === 'region' && v.name === a && v.view === 'region', JSON.stringify(v));
      t('region view: the docked island is reported at its FALLBACK while B is absent', row?.slot === 'col' && row?.placed === 'fallback', JSON.stringify(v.docks));
    }

    seen.length = 0;
    await act(async () => setStage('loading'));
    t('B mounted, its root not yet: the island renders NOWHERE (waiting)', where(host, a).length === 0, where(host, a).join() || 'nowhere');

    await act(async () => setStage('loaded'));
    t('B loaded: the island renders inside B\'s dock', where(host, a).join() === `dock:${b}.crew-aside`, where(host, a).join());
    t('...exactly once', where(host, a).length === 1);
    t('...never seen at the fallback on the way (no jump)', !seen.some((s) => s.includes('fallback')), seen.join(' | '));
    const island = host.querySelector(`[data-motu-slot="col"]`)!;
    t('...still A\'s island (A\'s region, A\'s binding)', island.getAttribute('data-motu-region') === a && island.textContent === 'column mine');
    t('...inside B\'s own wrapper, which motu did not draw', !!island.closest('[data-part="crew-aside"]'));
    t('...marked with where it docked', island.closest('[data-motu-docked-in]')?.getAttribute('data-motu-docked-in') === `${b}.crew-aside`);
    {
      const va = await awaitRegionView(aConfig as never, 'region', 500);
      const vb = await awaitRegionView(bConfig as never, 'region', 500);
      t('region view: with B on screen the island is reported DOCKED', (va.docks?.[0] as { placed?: string })?.placed === 'docked', JSON.stringify(va.docks));
      t("region view: B reports the dock it opens as filled", JSON.stringify(vb.docks) === JSON.stringify([{ opens: `${b}.crew-aside`, placed: 'filled' }]), JSON.stringify(vb.docks));
    }

    await act(async () => setStage('absent'));
    t('B gone again: back at the fallback', where(host, a).join() === 'fallback', where(host, a).join());
    observer.disconnect();
    await act(async () => root.unmount());
  }

  // --- B mounted in the SAME commit as A, root and all: decided before the first paint -----------
  {
    const { A, B, a, b } = regions();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(where(host, a).join(',') || 'nowhere'));
    observer.observe(host, { childList: true, subtree: true });
    await act(async () =>
      root.render(
        <A.Region>
          <A.Root conseil={<Column />} panel={<B.Region><B.Root rocket={<Rocket />} /></B.Region>} />
        </A.Region>,
      ),
    );
    t('same commit: in the dock', where(host, a).join() === `dock:${b}.crew-aside`, where(host, a).join());
    t('same commit: never committed anywhere else first', seen.every((s) => s === 'nowhere' || s === `dock:${b}.crew-aside`), seen.join(' | '));
    observer.disconnect();
    await act(async () => root.unmount());
  }

  // --- fallback: 'none' --------------------------------------------------------------------------
  {
    const { A, a } = regions('none');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<A.Region><A.Root conseil={<Column />} panel={null} /></A.Region>));
    t("fallback 'none': B absent, the island renders nowhere", where(host, a).length === 0, where(host, a).join());
    await act(async () => root.unmount());
  }

  // --- a page passing the dock prop is ignored, and said ----------------------------------------
  {
    const { A, B, a, b } = regions();
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(String(args[0]));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <A.Region>
          <A.Root
            conseil={<Column />}
            panel={<B.Region><B.Root rocket={<Rocket />} {...({ aside: <b data-intruder>mine</b> } as object)} /></B.Region>}
          />
        </A.Region>,
      ),
    );
    console.error = original;
    t('a page-passed dock prop is not rendered', !host.querySelector('[data-intruder]'));
    t('...and is reported', errors.some((e) => e.includes(`declares as dock "crew-aside"`)), errors[0] ?? '(nothing)');
    t('...and the docked island still lands', where(host, a).join() === `dock:${b}.crew-aside`);
    await act(async () => root.unmount());
  }

  // --- server render ------------------------------------------------------------------------------
  {
    const { A, B } = regions();
    const html = renderToString(
      <A.Region>
        <A.Root conseil={<Column label="ssr" />} panel={<B.Region><B.Root rocket={<Rocket />} /></B.Region>} />
      </A.Region>,
    );
    t('SSR: both layouts render', html.includes('data-part="base"') && html.includes('data-part="crew"'));
    t('SSR: the dock element is in the HTML', /data-motu-region-dock="crew\d+\.crew-aside"/.test(html));
    t('SSR: the docked island is NOT (decided on the client)', !html.includes('column ssr'));
  }

  console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
  process.exit(fail ? 1 : 0);
}
void main();
