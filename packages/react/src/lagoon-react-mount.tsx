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

/** One React root per container, so a re-mount replaces rather than stacks. */
const roots = new Map<HTMLElement, ReturnType<typeof createRoot>>();

export interface ReactLagoonOptions {
  elements: ElementSpec[];
  host?: HostBridge;
  seed?: Record<string, unknown>;
  channels?: Channel[];
  fit?: MotuFit;
  /**
   * 'region' renders the archipelago as one area; 'mountpoints' frames each slot separately, standing
   * in for islands placed individually across a host page. Mirrors the custom element's `view`
   * attribute, class names included, so recorded callsite frames (`motu archipelago record-frame`)
   * apply to either mount path.
   */
  view?: 'region' | 'mountpoints';
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
  // Switching station or view re-mounts: drop the previous root first, or React warns about two roots
  // on one container and the old tree keeps its store subscription alive.
  roots.get(mountEl)?.unmount();

  const islands = config.islands.map((island) =>
    opts.view === 'mountpoints' ? (
      <section
        key={island.slot}
        className="motu-frame"
        data-motu-arch={config.id}
        data-motu-slot={island.slot}
      >
        <header className="motu-frame__label">
          <span>{island.slot}</span>
        </header>
        <div className="motu-frame__stage">
          <Island slot={island.slot} fit={opts.fit} />
        </div>
      </section>
    ) : (
      <Island key={island.slot} slot={island.slot} fit={opts.fit} />
    ),
  );

  const tree = (
    <ArchipelagoProvider
      config={config}
      elements={opts.elements}
      host={opts.host}
      seed={opts.seed}
      channels={opts.channels}
    >
      {opts.view === 'mountpoints' ? <div className="motu-gallery">{islands}</div> : islands}
    </ArchipelagoProvider>
  );

  let root = createRoot(mountEl);
  roots.set(mountEl, root);
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
      roots.set(mountEl, root);
      root.render(tree);
    },
  };
}
