// Mounting a lagoon target the way a React host mounts it.
//
// The point of the lagoon is that what passes here is what ships. That guarantee is only worth
// anything if the two run the same way: a project whose pages render islands in their own React tree,
// verified against islands wrapped in custom elements with a root each, is verifying a mount path it
// does not use. Context, error boundaries and prop timing all differ between the two, and those are
// exactly the things that break.
//
// So the React host's lagoon renders through the same `<ArchipelagoProvider>` / `<Island>` its pages
// do. One React root for the whole lagoon — the same as a page has — not one per island.
import { createRoot } from 'react-dom/client';
import { provideToArchipelago, type ArchipelagoConfig, type Channel, type HostBridge, type MotuFit } from '@motu/core';
import { ArchipelagoProvider, Island } from './react-island.js';
import type { ElementSpec } from './bootstrap.js';

export interface ReactLagoonOptions {
  elements: ElementSpec[];
  host?: HostBridge;
  seed?: Record<string, unknown>;
  channels?: Channel[];
  fit?: MotuFit;
}

declare global {
  interface Window {
    /** The verify harness's handle on this mount path: the `provide` seam and a real re-mount. */
    __motuLagoon?: {
      provide: (key: string, value: unknown) => void;
      remount: () => void;
      archipelago: string;
    };
  }
}

/** Render every slot of `config` into `mountEl`, in one React tree. */
export function mountReactLagoon(
  mountEl: HTMLElement | null,
  config: ArchipelagoConfig,
  opts: ReactLagoonOptions,
): void {
  if (!mountEl) {
    console.warn('motu: lagoon has no mount element');
    return;
  }

  const tree = (
    <ArchipelagoProvider
      config={config}
      elements={opts.elements}
      host={opts.host}
      seed={opts.seed}
      channels={opts.channels}
    >
      {config.islands.map((island) => (
        <Island key={island.slot} slot={island.slot} fit={opts.fit} />
      ))}
    </ArchipelagoProvider>
  );

  let root = createRoot(mountEl);
  root.render(tree);

  // The harness drives both of these through <motu-archipelago> on the element path, which does not
  // exist here. Expose the same two capabilities so the SAME checks run against this mount path:
  //  - provide: feed a host value into the region (the data-flow check).
  //  - remount: tear the tree down and build a fresh one. Cloning the DOM node — what the element path
  //    does — only detaches React's tree here and would compare a live render against an empty div.
  //    Modules are not reloaded, which is the point: state that survives a remount is the leak the
  //    check is looking for.
  window.__motuLagoon = {
    archipelago: config.id,
    provide: (key, value) => provideToArchipelago(config.id, key, value),
    remount: () => {
      root.unmount();
      root = createRoot(mountEl);
      root.render(tree);
    },
  };
}
