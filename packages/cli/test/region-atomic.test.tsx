// CAN A SUBSCRIBER SEE A COMBINATION NO RENDER PRODUCED?
//
// acme's actions page computes `isOtherWeek: selectedWeekIndex !== -1 && !isCurrentWeek`, so
// `isOtherWeek` is DEFINED as `!isCurrentWeek` and both can never be true in one render. Its
// production corpus holds a state with both true, recorded by a fold that samples only at microtask
// boundaries — so the store really did settle there, long enough to paint.
//
// The cause is structural: one value computed in one render reaches the store through N independent
// island effects. This drives both shapes through a real React tree and asks the store what it held.
import { GlobalRegistrator } from '@happy-dom/global-registrator';
GlobalRegistrator.register();

// Without this React logs "not configured to support act(...)" on every render and the effect
// flushing it promises is not guaranteed — which is exactly the timing this test is about.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ArchipelagoProvider, Island } from '../../react/src/react-island';
import { getArchipelagoStore } from '@motu/core';

let pass = 0, fail = 0;
const t = (n: string, ok: boolean, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` -> ${d}` : ''}`); };

const Week = ({ isCurrentWeek }: { isCurrentWeek?: boolean }) => <b>{String(isCurrentWeek)}</b>;
const Challenges = ({ isOtherWeek }: { isOtherWeek?: boolean }) => <i>{String(isOtherWeek)}</i>;

const elements = [
  { tag: 'x-week', component: Week, options: { contract: { input: ['isCurrentWeek'] } } },
  { tag: 'x-challenges', component: Challenges, options: { contract: { input: ['isOtherWeek'] } } },
] as never[];

// A plain config, like model-b's: `archipelago()` is the typed builder and adds nothing this needs.
//
// ONE PER RUN. `defineArchipelago` registers a store globally by id and reuses it, so three runs
// sharing an id share a store — and each run's subscriber keeps recording the next run's writes. The
// first version of this reported 6 and 4 settled states for the same code that reports 4 and 2.
const configFor = (id: string) =>
  ({
    id,
    islands: [
      { slot: 'week', element: 'x-week', bind: { isCurrentWeek: 'isCurrentWeek' } },
      { slot: 'challenges', element: 'x-challenges', bind: { isOtherWeek: 'isOtherWeek' } },
    ],
  }) as never;

async function drive() {
  const config = configFor(`atomic-${runId++}`);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  // Every state the store SETTLES in, sampled the way the coverage fold samples: coalesced to a
  // microtask, so this cannot see a half-applied flush and every entry is a state that persisted.
  const seen: string[] = [];
  // AND EVERY NOTIFICATION, uncoalesced. This is what a non-React subscriber sees — the seam lens, a
  // foreign store adapter, anything reading on change rather than on a frame. The coalesced view
  // above cannot tell the two forms apart under `act()`, because both islands' effects land in one
  // flush there; this one can, because it is told between them.
  const raw: string[] = [];
  let store: ReturnType<typeof getArchipelagoStore> | null = null;

  const render = (isCurrentWeek: boolean) => {
    // ONE expression, exactly as the page computes it.
    const region = { isCurrentWeek, isOtherWeek: !isCurrentWeek };
    const islands = (
      <>
        <Island slot="week"><Week isCurrentWeek={region.isCurrentWeek} /></Island>
        <Island slot="challenges"><Challenges isOtherWeek={region.isOtherWeek} /></Island>
      </>
    );
    act(() => {
      root.render(
        <ArchipelagoProvider config={config} elements={elements}>{islands}</ArchipelagoProvider> as never,
      );
    });
    if (!store) {
      store = getArchipelagoStore(`atomic-${runId - 1}`)!;
      let queued = false;
      store.subscribe(() => raw.push(`${store!.get('isCurrentWeek')}/${store!.get('isOtherWeek')}`));
      store.subscribe(() => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => { queued = false; seen.push(`${store!.get('isCurrentWeek')}/${store!.get('isOtherWeek')}`); });
      });
    }
  };

  render(false);
  await new Promise((r) => setTimeout(r, 0));
  seen.length = 0;
  raw.length = 0;
  render(true);
  await new Promise((r) => setTimeout(r, 0));
  render(false);
  await new Promise((r) => setTimeout(r, 0));
  // Unmount inside `act` too: tearing down is a React update like any other, and React warns about
  // it — noise in a test that people then stop reading.
  act(() => root.unmount());
  host.remove();
  return { seen, raw };
}

console.log('\natomic region write — a combination no render produced\n');
let runId = 0;
const run = await drive();
console.log(`  what a subscriber is told : ${run.raw.join(' | ') || '(nothing)'}`);
console.log(`  what a coalesced fold sees: ${run.seen.join(' | ') || '(nothing)'}`);
console.log('');
const impossible = (s: string[]) => s.filter((x) => x === 'true/true' || x === 'false/false');
// THE REGRESSION THIS GUARDS. Before the provider flushed, each island wrote its own key from its own
// effect and a raw subscriber was told between them:
//
//     true/true | true/false | false/false | false/true
//
// `true/true` is impossible by construction — `isOtherWeek` is `!isCurrentWeek` — and acme's production
// corpus holds it. The page was not changed to fix this; the mechanism was.
t('no subscriber is told an impossible pair', impossible(run.raw).length === 0, run.raw.join(' | '));
t('one notification per change, not one per key', run.raw.length === 2, `${run.raw.length} notification(s)`);
t('...and the real states still arrive', run.raw.includes('true/false') && run.raw.includes('false/true'), run.raw.join(' | '));
// A coalesced fold — which is how acme's corpus is recorded — samples at microtask boundaries and so
// could never have seen the intermediate here anyway. It is the RAW view above that shows the cause,
// and this line records that the two now agree.
t('a coalesced fold agrees', run.seen.length === 2, `${run.seen.length} settled state(s)`);

console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
