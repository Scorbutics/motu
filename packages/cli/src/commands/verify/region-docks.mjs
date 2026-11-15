// `dock-placement` — the runtime half of docks: does the island land INSIDE the dock, and does it fall
// back where it declares when the dock's region is not on screen?
//
// "Rendered" is not the claim. A docked island that renders at its fallback while the dock stands
// empty beside it renders perfectly well — every island check is green, every flow in the mountpoints
// view is green — and the page is wrong. This check reads WHERE it rendered.
import { dockPlacementLagoon } from '../../playwright-lagoon.mjs';
import { docksOfRegion } from '../../lib/docks.mjs';
import { paths } from '../../lib/util.mjs';
import { step } from './report.mjs';

export async function dockPlacementCheck(report, id, port) {
  const { claims, states, problems } = docksOfRegion(id, paths.archipelagosDir);
  if (!claims.length && !states.length) return; // no docks here: nothing to place, nothing to say
  if (problems.some((p) => p.level === 'error')) {
    report.skip('dock-placement', 'the dock declarations are refused (see `dock` above) — there is no composition to render');
    return;
  }
  const composed = states.map((s) => ({
    state: `${id}.dock.${s.host}.${s.dock}`,
    address: `${s.host}.${s.dock}`,
    slot: s.slot,
    claimant: s.claimant,
  }));
  const fallbacks = claims.map((c) => ({ slot: c.slot, fallback: c.fallback, address: `${c.region}.${c.dock}` }));
  if (!composed.length && !fallbacks.length) {
    // Opens a dock nobody claims: an empty place, and nothing that could land in it.
    report.skip('dock-placement', 'this region opens no claimed dock and docks nothing — no placement to check');
    return;
  }
  const r = await step('dock-placement', () => dockPlacementLagoon({ id, port, composed, fallbacks }));
  let checked = 0;
  for (const c of r.composed) {
    const inDock = c.found.filter((f) => f.dock === c.address);
    const elsewhere = c.found.filter((f) => f.dock !== c.address);
    const url = `?region=${id}&state=${c.state}`;
    if (!inDock.length) {
      report.error(
        'dock-placement',
        `${c.claimant}'s ${c.slot} is not inside dock ${c.address} in ${url} — ` +
          (c.found.length
            ? `it rendered ${c.found[0].dock ? `in dock ${c.found[0].dock}` : 'outside every dock'}`
            : c.outcome?.error ?? 'it did not render at all'),
      );
    } else if (!inDock.some((f) => f.len > 0)) {
      report.error('dock-placement', `${c.claimant}'s ${c.slot} is inside dock ${c.address} in ${url} and renders nothing`);
    } else if (elsewhere.length) {
      report.error('dock-placement', `${c.claimant}'s ${c.slot} renders in dock ${c.address} AND ${elsewhere.length} more time(s) elsewhere in ${url} — a docked island has one place at a time`);
    } else {
      checked++;
      report.ok('dock-placement', `${c.claimant}.${c.slot} renders inside dock ${c.address} — ${url}`, { n: 1, of: 'composed state(s) placed' });
    }
  }
  for (const f of r.fallbacks) {
    const outside = f.found.filter((x) => !x.dock);
    if (f.fallback === 'none') {
      if (f.found.length) report.error('dock-placement', `${f.slot} declares \`fallback: 'none'\` and renders in ?region=${id} while ${f.address.split('.')[0]} is not on screen`);
      else {
        checked++;
        report.ok('dock-placement', `${f.slot} renders nowhere while ${f.address.split('.')[0]} is absent — \`fallback: 'none'\``, { n: 1, of: 'fallback(s) held' });
      }
    } else if (!outside.length || !outside.some((x) => x.len > 0)) {
      report.error('dock-placement', `${f.slot} does not render at its fallback in ?region=${id} — with ${f.address.split('.')[0]} absent it should render where ${id}'s root places it`);
    } else {
      checked++;
      report.ok('dock-placement', `${f.slot} renders at its fallback while ${f.address.split('.')[0]} is absent — ?region=${id}`, { n: 1, of: 'fallback(s) held' });
    }
  }
  if (!checked && !report.findings.some((x) => x.check === 'dock-placement' && x.level === 'error')) {
    report.inconclusive('dock-placement', 'no placement was read — the lagoon mounted nothing to look at');
  }
}
