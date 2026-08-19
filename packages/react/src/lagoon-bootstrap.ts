// The lagoon harness entry, framework-side. A composition root's lagoon entry is a thin shim: it reads
// the build-injected target/fit and hands this the project's element registry + fixtures + archipelago
// resolver. Everything else — mock transport wiring, the default host, target resolution, mount — is
// generic and lives here so every project's lagoon entry stays 3 lines.
import { configure } from '@motu/runtime';
import { MockTransport, type Fixture } from '@motu/runtime/mock';
import { FailingTransport } from '@motu/runtime/mock';
import { applyMotuChrome } from '@motu/core';
import type { HostBridge, MotuFit, ArchipelagoConfig, Channel, MotuChromeTheme } from '@motu/core';
import { defineLagoon, type ElementSpec, type LagoonTarget } from './bootstrap.js';

export interface LagoonBootstrapOptions {
  /** The project's element registry (same one the real composition roots use). */
  elements: ElementSpec[];
  /** Compiled island stylesheet text. */
  css?: string;
  /** MockTransport fixtures replayed offline (no backend/login). */
  fixtures?: Fixture[];
  /** Roles the mock caller holds, satisfying the fixtures' role gates. */
  roles?: string[];
  /** Resolve an archipelago config by id (the project's registry lookup). */
  resolveArchipelago: (id: string) => ArchipelagoConfig | undefined;
  /** "island:x-some-tag" | "archipelago:members"; empty => the members archipelago. */
  target?: string;
  /** "native" | "legacy" — only meaningful for an island target. */
  fit?: string;
  /** Outward channel; a console-logging no-op by default. */
  host?: HostBridge;
  /** Initial store contents so bound islands render meaningfully. */
  seed?: Record<string, unknown>;
  /** Inbound channels: host signals mirrored into the store (same as the real composition roots). */
  channels?: Channel[];
  /** Element id to append the archipelago into (default 'lagoon'). */
  mountId?: string;
  /** When set, every contract call fails with this HTTP status — verify's error-resilience mount. */
  forceErrorStatus?: number;
  /**
   * Point motu's chrome at this application's colours (see `applyMotuChrome`). The focused lagoon
   * shows little chrome of its own, but the tokens also reach anything mounted alongside it — the
   * seam lens above all — so a project's colour should not depend on which entry you opened.
   *
   * Any CSS colour works, which is the point: reference the host's token to follow a rebrand
   * (`hsl(var(--primary))`), reach for a darker one it already defines (`hsl(var(--primary-control))`),
   * or derive one when a brand primary is too bright to sit under white chrome
   * (`color-mix(in srgb, hsl(var(--primary)) 70%, #000)`).
   */
  chrome?: MotuChromeTheme;
}

/** Parse the "kind:value" target string into a LagoonTarget, resolving archipelagos via the project. */
function resolveTarget(opts: LagoonBootstrapOptions): LagoonTarget {
  const raw = (typeof opts.target === 'string' && opts.target) || 'archipelago:members';
  const [kind, ...rest] = raw.split(':');
  const value = rest.join(':');
  if (kind === 'island') {
    const fit = (typeof opts.fit === 'string' && opts.fit) as MotuFit | '';
    return { kind: 'island', tag: value, fit: fit || undefined };
  }
  const config = opts.resolveArchipelago(value);
  if (!config) throw new Error(`lagoon: unknown archipelago "${value}"`);
  return { kind: 'archipelago', config };
}

/**
 * Boot the lagoon focused on ONE target in isolation, backed by MockTransport. Configures the mock
 * transport from the supplied fixtures, resolves the target, mounts it, and returns the element.
 */
export function bootstrapLagoon(opts: LagoonBootstrapOptions): HTMLElement {
  // Before anything paints, so the chrome never flashes motu's default over the host's palette.
  applyMotuChrome(opts.chrome ?? {});
  configure(
    opts.forceErrorStatus
      ? new FailingTransport(opts.forceErrorStatus)
      : new MockTransport(opts.fixtures ?? [], opts.roles ?? []),
  );

  const host: HostBridge = opts.host ?? {
    navigate: (path) => console.log('[lagoon] navigate', path),
    action: (name, detail) => console.log('[lagoon] action', name, detail),
  };

  const el = defineLagoon(resolveTarget(opts), {
    elements: opts.elements,
    css: opts.css,
    defaultTheme: 'motu',
    host,
    seed: opts.seed ?? { criteria: {} },
    channels: opts.channels,
  });

  document.getElementById(opts.mountId ?? 'lagoon')?.appendChild(el);
  return el;
}
