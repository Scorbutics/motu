// CAN A SUBSCRIBER SEE A COMBINATION NO RENDER PRODUCED?
//
// peps' actions page computes `isOtherWeek: selectedWeekIndex !== -1 && !isCurrentWeek`, so
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
const config = {
  id: 'atomic-test',
  islands: [
    { slot: 'week', element: 'x-week', bind: { isCurrentWeek: 'isCurrentWeek' } },
    { slot: 'challenges', element: 'x-challenges', bind: { isOtherWeek: 'isOtherWeek' } },
  ],
} as never;

async function drive(useRegionProp: boolean) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  // Every state the store SETTLES in, sampled the way the coverage fold samples: coalesced to a
  // microtask, so this cannot see a half-applied flush and every entry is a state that persisted.
  const seen: string[] = [];
  let store: ReturnType<typeof getArchipelagoStore> | null = null;

  const render = (isCurrentWeek: boolean) => {
    // ONE expression, exactly as the page computes it.
    const region = { isCurrentWeek, isOtherWeek: !isCurrentWeek };
    act(() => {
      root.render(
        <ArchipelagoProvider config={config} elements={elements} {...(useRegionProp ? { region } : {})}>
          <Island slot="week"><Week isCurrentWeek={region.isCurrentWeek} /></Island>
          <Island slot="challenges"><Challenges isOtherWeek={region.isOtherWeek} /></Island>
        </ArchipelagoProvider> as never,
      );
    });
    if (!store) {
      store = getArchipelagoStore('atomic-test')!;
      let queued = false;
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
  render(true);
  await new Promise((r) => setTimeout(r, 0));
  render(false);
  await new Promise((r) => setTimeout(r, 0));
  root.unmount();
  host.remove();
  return seen;
}

console.log('\natomic region write — a combination no render produced\n');
const perIsland = await drive(false);
const asOneObject = await drive(true);
console.log(`  per-island props : ${perIsland.join(', ') || '(nothing)'}`);
console.log(`  region={…}       : ${asOneObject.join(', ') || '(nothing)'}`);
console.log('');
const impossible = (s: string[]) => s.filter((x) => x === 'true/true' || x === 'false/false');
t('the region object never publishes an impossible pair', impossible(asOneObject).length === 0, impossible(asOneObject).join(', '));
t('...and it does publish the real ones', asOneObject.includes('true/false') && asOneObject.includes('false/true'), asOneObject.join(', '));
// THE MECHANISM, WHICH IS WHAT THIS CAN ACTUALLY PROVE. Two changes should settle the region twice.
// Per-island publication settles it FOUR times: each island's effect writes its own key, so every
// change passes through a state where one key has moved and the other has not. Under `act()` those
// land in the same flush, so the intermediate is consistent here and the pair is never impossible —
// which is precisely why this test cannot reproduce peps' both-true state. That one needs the two
// writes in different TASKS, which is a scheduling accident a test harness collapses.
//
// So this asserts the cause, not the symptom: the staggering exists, and the object form removes it.
t('per-island publication settles once per KEY', perIsland.length === 4, `${perIsland.length} settled state(s)`);
t('...and the region object settles once per CHANGE', asOneObject.length === 2, `${asOneObject.length} settled state(s)`);

console.log(`\n${fail === 0 ? 'PASS' : `FAIL — ${fail} assertion(s)`}  (${pass} passed)`);
process.exit(fail ? 1 : 0);
