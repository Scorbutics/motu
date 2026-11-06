// A ROOT PROP FILLED BY ANOTHER REGION, as the lagoon shows it: a placeholder, loaded on request.
//
// `slots: { businessTeamPanel: { region: 'equipage' } }` says the prop is a whole region of its own —
// its islands, keys, seed, flows and address. Rendering it inline by default would couple this
// region's flows and snapshots to how the other one renders, which is exactly the independence the
// split exists to buy: a change to the child would move the parent's baseline, and a parent flow could
// pass or fail on the child's data. So the slot says what is there and offers it — in place, or at the
// child's own address — and the parent's own render stays the parent's.
//
// A reference that cannot be honoured (an unknown id, a cycle) REFUSES, in the same shape as the rest
// of the lagoon: a red `role="alert"` naming what is wrong, a console error, and no load button. It
// never renders some other region in its place.
import { createElement, useState, type CSSProperties, type ReactNode } from 'react';

/** What a referenced region resolves to, or why it cannot be loaded. */
export type ResolvedRegionRef<TLoaded = unknown> = { ok: true; loaded: TLoaded } | { ok: false; error: string };

export interface RegionRefSlotProps<TLoaded = unknown> {
  /** The region whose root has this prop. */
  parent: string;
  /** The root prop the referenced region fills. */
  prop: string;
  /** The referenced region's id. */
  refId: string;
  /** Its display name, when the lagoon has one (`stations[id].label`). */
  label?: string;
  /** Resolve the reference — called up front, so a broken one refuses before anybody clicks. */
  resolve?: (id: string) => ResolvedRegionRef<TLoaded>;
  /** Render the resolved region in place. */
  render?: (loaded: TLoaded) => ReactNode;
  /** The referenced region's own address. */
  href?: string;
  /** Open it at its own address WITHOUT a reload, when the entry can. */
  open?: (id: string) => void;
}

const refusedLogged = new Set<string>();

const frame: CSSProperties = {
  border: '1px dashed color-mix(in srgb, currentColor 30%, transparent)',
  borderRadius: 10,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  font: '13px/1.5 system-ui, sans-serif',
  background: 'color-mix(in srgb, currentColor 4%, transparent)',
};
const caption: CSSProperties = {
  font: '500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'color-mix(in srgb, currentColor 60%, transparent)',
};
const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' };
const button: CSSProperties = {
  font: 'inherit',
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};

/** The placeholder, and the referenced region once someone asked for it. */
export function RegionRefSlot<TLoaded>(props: RegionRefSlotProps<TLoaded>): ReactNode {
  const { parent, prop, refId, label, resolve, render, href, open } = props;
  const [loaded, setLoaded] = useState(false);
  const name = label && label !== refId ? `${label} (${refId})` : refId;
  const resolved = resolve ? resolve(refId) : null;

  if (resolved && !resolved.ok) {
    // Said in the console too: the banner is what survives into a screenshot, the console is what a
    // check reading logs sees. Same pair the lagoon's state refusals use. Once per reference, not per
    // render — the region re-renders on every store change.
    const mark = `${parent}.${prop}→${refId}`;
    if (!refusedLogged.has(mark)) {
      refusedLogged.add(mark);
      console.error(`motu: ${parent}.${prop} → region "${refId}" refused: ${resolved.error}`);
    }
    return createElement(
      'div',
      {
        role: 'alert',
        'data-motu-region-ref': refId,
        'data-motu-region-ref-state': 'refused',
        style: { ...frame, borderColor: '#b91c1c', color: '#b91c1c', background: 'rgba(185, 28, 28, 0.06)' },
      },
      createElement('span', { style: caption }, `${prop} → region ${refId}`),
      createElement('strong', null, `This slot refers to region "${refId}", which cannot be shown.`),
      createElement('span', null, resolved.error),
    );
  }

  const openLink = href
    ? createElement(
        'a',
        {
          href,
          'data-motu-region-ref-open': refId,
          onClick: open
            ? (e: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; button?: number }) => {
                // A modified click is someone asking for a new tab: let the browser have it.
                if (e.metaKey || e.ctrlKey || (e.button ?? 0) !== 0) return;
                e.preventDefault();
                open(refId);
              }
            : undefined,
        },
        `Open ${name} on its own`,
      )
    : null;

  if (loaded && resolved?.ok && render) {
    return createElement(
      'div',
      { 'data-motu-region-ref': refId, 'data-motu-region-ref-state': 'loaded', style: { display: 'contents' } },
      createElement(
        'div',
        { style: { ...actions, ...caption, margin: '0 0 6px' } },
        createElement('span', null, `${prop} → region ${refId} · loaded here`),
        createElement('button', { type: 'button', style: { ...button, padding: '2px 8px' }, onClick: () => setLoaded(false) }, 'Unload'),
        openLink,
      ),
      render(resolved.loaded),
    );
  }

  return createElement(
    'div',
    {
      role: 'group',
      'aria-label': `Region ${name}, a separate region`,
      'data-motu-region-ref': refId,
      'data-motu-region-ref-state': 'placeholder',
      style: frame,
    },
    createElement('span', { style: caption }, `${prop} → region ${refId}`),
    createElement('strong', null, `Region ${name}`),
    createElement(
      'span',
      null,
      `A separate motu region fills this slot. It has its own islands, state and flows, and is not loaded ` +
        `here by default, so "${parent}" is previewed and checked without it.`,
    ),
    createElement(
      'div',
      { style: actions },
      resolved?.ok && render
        ? createElement(
            'button',
            { type: 'button', style: button, 'data-motu-region-ref-load': refId, onClick: () => setLoaded(true) },
            `Load ${name} here`,
          )
        : createElement('span', { style: caption }, 'cannot be loaded in this view'),
      openLink,
    ),
  );
}
