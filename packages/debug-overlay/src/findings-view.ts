// The findings, rendered into somebody else's panel.
//
// The dock hosts this, and the dock must not import this package — @motu/debug-overlay is dev-only
// and a production root has to shake it out entirely. So the direction is inverted: the lens is
// handed a container and mounts itself into it, exactly as the toolbar chips reach the dock through
// `setMotuToolbarHost`. The dock stays ignorant of what is inside, and this file stays the only place
// that knows what a finding looks like.
//
// PLAIN DOM, not a second React root. The panel is React because it re-renders wide tables on every
// store write; this is a short list inside a host that is itself plain DOM, and a second root inside
// it would buy diffing for a dozen nodes at the cost of a second reconciler in the page.
//
// The kit's classes are used bare: the dock has already injected `motuKitCss('#tide')` at its own
// scope, so anything mounted inside it is styled without this file shipping a stylesheet.
import { getMountedIslands, getIslandDefinition } from '@motu/core';
import { lens } from './store';
import { computeProps, verdictOf, type Verdict } from './model';
import { findingsOf, tallyOf, type Finding } from './findings';
import { toggleDebugOverlay, isDebugOverlayOpen } from './overlay';

const TONE_LABEL: Record<Verdict, string> = { broken: 'broken', warn: 'warning', neutral: 'note', ok: 'ok' };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

/** Everything findingsOf needs, gathered from the registries the lens already watches. */
function collect() {
  const islands = getMountedIslands();
  const verdicts = new Map<string, Verdict>();
  for (const info of islands) {
    verdicts.set(info.slot, verdictOf(computeProps(info, getIslandDefinition(info.element))));
  }
  // The writes map is per store; a dock panel is showing one region, so merge what is active.
  const writes = new Map<string, Set<string>>();
  for (const store of lens.activeStores()) {
    for (const [key, who] of lens.writes.get(store) ?? []) {
      const set = writes.get(key) ?? new Set<string>();
      for (const w of who) set.add(w);
      writes.set(key, set);
    }
  }
  const traced = new Set(lens.calls.map((c) => `${c.service}.${c.method}`)).size;
  return { islands, writes, verdicts, calls: lens.calls.length, traced };
}

/**
 * The findings as DATA, for a panel that is not in this document.
 *
 * The host draws the lagoon's chrome from outside the artifact now, and findings are derived from
 * things that only exist in HERE: the mount registry, the store's write log, the call log. So the
 * derivation stays and only its result crosses — the same split the toolbar chips already use, and
 * the right one anyway, because the derivation is small and stable while the rendering is what churns.
 */
export function currentFindings() {
  const input = collect();
  const findings = findingsOf(input);
  return { findings, tally: tallyOf(findings), islands: input.islands.length };
}

/**
 * Render the findings into `container`, and keep them current. Returns the teardown.
 */
export function mountFindings(container: HTMLElement): () => void {
  const tally = el('div', { class: 'seam-tally' });
  const head = el('div', { class: 'sect__head' });
  const list = el('div', { class: 'list', role: 'list' });
  container.append(tally, head, list);

  const paint = () => {
    const input = collect();
    const findings = findingsOf(input);
    const t = tallyOf(findings);

    // THE TALLY IS COUNTS, and the counts are all it is. There is no headline over this: a sentence
    // summarising a region cannot be contradicted by the region, which is the whole reason it was
    // dropped from the design. What a person needs first is how many things are here and how many of
    // them are theirs to decide.
    tally.replaceChildren(
      ...([
        ['broken', t.broken],
        ['warn', t.warn],
        ['neutral', t.note],
      ] as const)
        .filter(([, n]) => n > 0)
        .map(([tone, n]) =>
          el('span', { class: 'seam-count', 'data-tone': tone }, el('i', {}), `${n} ${TONE_LABEL[tone]}${n === 1 ? '' : 's'}`),
        ),
      el('span', { class: 'seam-count', 'data-tone': 'ok' }, el('i', {}), `${input.islands.length} mounted`),
    );

    head.replaceChildren(
      el('span', { class: 'motu-cap' }, 'Findings'),
      el(
        'span',
        { class: 'count' },
        t.decisions ? `${findings.length} · ${t.decisions} needs a decision` : `${findings.length}`,
      ),
    );

    if (!findings.length) {
      list.replaceChildren(el('p', { class: 'motu-empty' }, 'Nothing to report about this region.'));
      return;
    }

    list.replaceChildren(
      ...findings.map((f: Finding) => {
        const card = el(
          'button',
          {
            class: 'seam-find',
            type: 'button',
            'data-tone': f.tone,
            title: 'Open the lens at the evidence for this',
          },
          el('span', { class: 'seam-find__t' }, el('i', {}), f.title),
          el('span', { class: 'seam-find__d' }, f.detail),
        );
        // THE FINDING IS THE WAY IN, not the whole story. Each one was derived from a table that is
        // still in the lens panel, so pressing it opens that panel rather than trying to reproduce a
        // wide table in a 340px column.
        card.addEventListener('click', () => {
          if (!isDebugOverlayOpen()) toggleDebugOverlay();
        });
        return card;
      }),
    );
  };

  paint();
  const stop = lens.subscribe(paint);
  return () => {
    stop();
    container.replaceChildren();
  };
}
