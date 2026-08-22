// The client half of the contract seam: a typed façade over the one `call()` seam in @motu/runtime.
//
// This is what `@motu/contract` is on the Jakarta side, minus the generator. The service map's TYPE
// is the contract, so `contract.directory.getSectors()` carries the real signature of the function
// the route handler will run, and a change to that function fails `tsc` here — no regeneration, no
// window where the two disagree.
//
// Everything goes through `call()`, which is why an island using this still works in the lagoon: the
// lagoon configures MockTransport instead of HttpTransport and the same component replays fixtures
// with no backend at all.
import { call } from '@motu/runtime';
import type { MotuServiceMap } from './services';

/** The client's shape: the server's service map, with every method reachable as-is. */
export type Contract<S extends MotuServiceMap> = {
  readonly [Service in keyof S]: {
    readonly [Method in keyof S[Service]]: S[Service][Method];
  };
};

/**
 * Build the typed contract client. Pass the server's service map type; nothing is imported from the
 * server at runtime (the type argument is erased), so this stays safe in a client component.
 *
 * ```ts
 * import type { AppServices } from '@/motu/server/services'   // type-only: erased at build
 * export const contract = createContract<AppServices>()
 * ```
 *
 * The proxy is lazy and shallow — two levels, resolved on access — so adding a service or method on
 * the server needs no change here at all.
 */
export function createContract<S extends MotuServiceMap>(): Contract<S> {
  const services = new Map<string, unknown>();

  return new Proxy(Object.create(null) as Contract<S>, {
    get(_target, service: string | symbol) {
      // A bare property read (a bundler probing for `then`, devtools inspecting) must not be
      // mistaken for a service name.
      if (typeof service !== 'string') return undefined;
      const cached = services.get(service);
      if (cached) return cached;

      const methods = new Proxy(Object.create(null), {
        get(_t, method: string | symbol) {
          if (typeof method !== 'string') return undefined;
          return (...args: unknown[]) => call(service, method, args);
        },
      });
      services.set(service, methods);
      return methods;
    },
  });
}
